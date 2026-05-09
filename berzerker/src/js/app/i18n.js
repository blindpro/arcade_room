/**
 * i18n for BERZERK!
 *
 * Resolution order on boot: localStorage('berzerk.lang') → navigator.language
 * 2-letter prefix → 'en'.
 *
 * NOTE: `robotbarks.pools.*` arrays are AUTHORED INDEPENDENTLY per locale —
 * Spanish robot barks are not literal translations of the English ones.
 * A robot caller into the void should sound natural in either language.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'berzerk.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      // <head>
      'doc.title': 'BERZERK!',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'BERZERK!',
      'menu.subtitle': 'Audio-first arcade horror.',
      'menu.start': 'Start',
      'menu.help': 'How to play',
      'menu.learn': 'Learn the sounds',
      'menu.highscores': 'High scores',
      'menu.settings': 'Settings',

      // Ready
      'ready.aria': 'Get ready',
      'ready.title': 'GET READY',
      'ready.room': 'Room {n}',

      // Game
      'game.aria': 'Game',
      'hud.score': 'Score',
      'hud.lives': 'Lives',
      'hud.room': 'Room',
      'hud.robots': 'Robots',

      // Pause
      'pause.aria': 'Paused',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.menu': 'Quit to menu',

      // Game over
      'gameover.aria': 'Game over',
      'gameover.title': 'Game Over',
      'gameover.finalScore': 'Final score',
      'gameover.room': 'Room',
      'gameover.enterInitials': 'New high score! Enter your initials:',
      'gameover.submit': 'Submit',
      'gameover.playAgain': 'Play again',
      'gameover.highscores': 'High scores',
      'gameover.menu': 'Main menu',

      // High scores
      'highscores.aria': 'High scores',
      'highscores.title': 'High Scores',
      'highscores.empty': 'No scores yet. Be the first.',
      'highscores.back': 'Back',
      'highscores.entry': '{rank}. {name} — {score} (room {room})',

      // Help
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.intro': 'Survive the robot rooms. Walls electrocute on touch — you and the robots both.',
      'help.controlsHeader': 'Controls',
      'help.controlsMove': '<kbd>Arrows</kbd> — move (8 directions)',
      'help.controlsFire': '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> — fire. Single keys shoot the four cardinals; hold two at once for diagonals (e.g. <kbd>W</kbd>+<kbd>D</kbd> shoots northeast). You stand still while firing.',
      'help.controlsFireNumpad': 'Or pick the <em>numpad</em> control scheme in Settings: <kbd>4</kbd> <kbd>6</kbd> <kbd>8</kbd> <kbd>2</kbd> for cardinals, <kbd>7</kbd> <kbd>9</kbd> <kbd>1</kbd> <kbd>3</kbd> for diagonals — one key per direction.',
      'help.controlsExample': 'To chase a robot northeast while strafing west: hold <kbd>←</kbd> + <kbd>W</kbd> + <kbd>D</kbd>. Movement reads only the arrows; firing reads only WASD or the numpad — the two clusters never fight.',
      'help.controlsPause': '<kbd>Esc</kbd> — pause',
      'help.controlsF1': '<kbd>F1</kbd> — announce score',
      'help.controlsF2': '<kbd>F2</kbd> — announce lives',
      'help.controlsF3': '<kbd>F3</kbd> — announce room',
      'help.controlsF4': '<kbd>F4</kbd> — announce robots remaining',
      'help.tipsHeader': 'Tips',
      'help.tipsWalls': 'Touching any wall is fatal. Robots are dumb — nudge them into walls.',
      'help.tipsClearAndExit': 'Killing every robot does <strong>not</strong> auto-advance. You still have to walk out through one of the four exits in the perimeter wall. Clear the room first and you collect a bonus (10 points per robot) plus a fanfare on the way out; bail early and Evil Otto enters the next room with you. <kbd>F4</kbd> confirms how many robots remain.',
      'help.tipsOtto': 'Linger too long and Evil Otto arrives, bouncing on a tritone. He cannot be killed. He passes through walls. Run.',
      'help.tipsExits': 'Once the room is cleared, each of the four exits sings its own chord pad. <strong>North</strong> is bright and high; <strong>east</strong> is mid and stable; <strong>south</strong> is warm and low; <strong>west</strong> is deep and dim. Walk toward the chord you want — louder and more central means you are closer. While robots are still alive the chords stay silent so you can focus on combat.',
      'help.back': 'Back',

      // Settings
      'settings.aria': 'Settings',
      'settings.title': 'Settings',
      'settings.back': 'Back',
      'settings.masterVolume': 'Master volume',
      'settings.voiceVolume': 'Robot voice volume',
      'settings.sfxVolume': 'Sound effects volume',
      'settings.ambientWallBuzzVolume': 'Wall buzz volume',
      'settings.useTtsAnnouncer': 'Use TTS announcer',
      'settings.gamepadEnabled': 'Gamepad input',
      'settings.controlScheme': 'Fire keys',
      'settings.controlScheme.wasdFire': 'WASD',
      'settings.controlScheme.numpadFire': 'Numpad',
      'settings.difficulty': 'Difficulty',
      'settings.difficulty.easy': 'Easy',
      'settings.difficulty.normal': 'Normal',
      'settings.difficulty.hard': 'Hard',
      'settings.on': 'On',
      'settings.off': 'Off',

      // Language
      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',
      'language.button': 'Language',

      // Test
      'test.aria': 'Audio orientation test',
      'test.title': 'Audio orientation test',
      'test.subtitle': 'Listen for ticks at front, right, behind, and left.',
      'test.intro': 'You should hear ticks at front, right, behind, and left.',
      'test.dirFront': 'Front.',
      'test.dirRight': 'Right.',
      'test.dirBehind': 'Behind.',
      'test.dirLeft': 'Left.',
      'test.replay': 'Replay',
      'test.back': 'Back',

      // Learn
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Click any sound to audition it.',
      'learn.back': 'Back',
      'learn.wall': 'Electric wall (zap)',
      'learn.wallPerimeter': 'Perimeter wall (steady hum)',
      'learn.wallPillar': 'Interior pillar (coil flicker)',
      'learn.playerStep': 'Your footstep',
      'learn.footstepGrunt': 'Grunt robot — footsteps',
      'learn.footstepFlank': 'Flank robot — footsteps',
      'learn.footstepSniper': 'Sniper robot — footsteps',
      'learn.laserGrunt': 'Grunt robot — laser shot',
      'learn.laserFlank': 'Flank robot — laser shot',
      'learn.laserSniper': 'Sniper robot — laser shot',
      'learn.laserBeam': 'Laser beam — in flight',
      'learn.myLaser': 'Your laser',
      'learn.robotDeath': 'Robot dies',
      'learn.wallZap': 'Wall electrocution',
      'learn.playerHitByLaser': 'You — caught by laser',
      'learn.playerHitByWall': 'You — caught by wall',
      'learn.playerHitByOtto': 'You — caught by Evil Otto',
      'learn.ottoBounce': 'Evil Otto — tritone bounce',
      'learn.ottoBuzz': 'Evil Otto — proximity buzz',
      'learn.barkAlert': 'Robot — INTRUDER ALERT',
      'learn.barkChicken': 'Robot — CHICKEN',
      'learn.barkGotHim': 'Robot — GOT HIM',
      'learn.extraLife': 'Extra life',
      'learn.gameOver': 'Game over jingle',
      'learn.roomCleared': 'Room cleared fanfare',
      'learn.getReady': 'Get ready tone',

      // Announcer
      'ann.score': 'Score: {score}.',
      'ann.lives': 'Lives: {lives}.',
      'ann.room': 'Room {n}.',
      'ann.robots': '{n} robots remaining.',
      'ann.robotsAndOtto': '{n} robots remaining. Evil Otto is here.',
      'ann.ottoOnly': 'No robots. Evil Otto is here.',
      'ann.noRobots': 'Room cleared.',
      'ann.debugEmpty': 'Debug: empty room. No robots, no Otto.',
      'ann.gap.N': 'North gap',
      'ann.gap.E': 'East gap',
      'ann.gap.S': 'South gap',
      'ann.gap.W': 'West gap',
      'ann.gap.item': '{header}: {forward} steps {forwardDir}, {lateral} {lateralDir}.',
      'ann.gap.itemAligned': '{header}: {forward} steps {forwardDir}, lined up.',
      'ann.gap.withOtto': '{body} Otto is here.',
      'ann.getReady': 'Get ready. Room {n}.',
      'ann.roomCleared': 'Room cleared! Bonus {bonus}.',
      'ann.extraLife': 'Extra life!',
      'ann.caughtByLaser': 'Caught by a laser.',
      'ann.caughtByWall': 'Electrocuted on the wall.',
      'ann.caughtByOtto': 'Evil Otto got you.',
      'ann.gameOverShort': 'Game over.',
      'ann.ottoArrives': 'Evil Otto is here!',
      'ann.playing': 'Playing {label}.',
      'ann.learnHello': 'Browse and audition each sound.',
      'ann.scoreShort': '{score}',
      'ann.dir.north': 'north',
      'ann.dir.east': 'east',
      'ann.dir.south': 'south',
      'ann.dir.west': 'west',
      'ann.exits.open': 'Open: {open}.',
      'ann.exits.allOpen': 'All directions clear.',

      // Online leaderboard
      'ann.onlineRank': 'Online rank: number {rank}.',
      'ann.onlineError': 'Could not reach the online leaderboard. Score saved locally.',
      'gameover.nameRequired': 'Type a name to save your score.',
      'online.posting': 'Posting your score…',
      'online.rank': 'Online rank: #{rank}',
      'online.error': 'Couldn’t reach the leaderboard. Saved locally.',
      'online.viewBoard': 'View the world leaderboard',

      // Robot barks (English pool — author independently per locale)
      'robotbarks.pools.spotted': ['robotbarks.alert', 'robotbarks.killTheIntruder', 'robotbarks.getHumanoid'],
      'robotbarks.pools.killAlly': ['robotbarks.avenge', 'robotbarks.youWillPay'],
      'robotbarks.pools.flee': ['robotbarks.chicken', 'robotbarks.mustNotEscape'],
      'robotbarks.pools.spawn': ['robotbarks.alert', 'robotbarks.killTheIntruder'],
      'robotbarks.pools.taunt': ['robotbarks.destroyHuman', 'robotbarks.futile', 'robotbarks.noEscape', 'robotbarks.inferior', 'robotbarks.fearMe'],
      'robotbarks.pools.playerKilled': ['robotbarks.gotHim', 'robotbarks.intruderDown', 'robotbarks.targetDown'],
      'robotbarks.pools.deathCurse': ['robotbarks.curseFuckYou', 'robotbarks.curseLoser', 'robotbarks.curseDamnYou', 'robotbarks.curseRotInHell', 'robotbarks.curseBastard'],
      'robotbarks.alert': 'INTRUDER ALERT',
      'robotbarks.killTheIntruder': 'KILL THE INTRUDER',
      'robotbarks.getHumanoid': 'GET THE HUMANOID',
      'robotbarks.gotHim': 'GOT HIM',
      'robotbarks.intruderDown': 'INTRUDER DOWN',
      'robotbarks.targetDown': 'TARGET DOWN',
      'robotbarks.chicken': 'CHICKEN, FIGHT LIKE A ROBOT',
      'robotbarks.mustNotEscape': 'THE HUMANOID MUST NOT ESCAPE',
      'robotbarks.avenge': 'AVENGE THE FALLEN',
      'robotbarks.youWillPay': 'YOU WILL PAY',
      'robotbarks.destroyHuman': 'DESTROY THE HUMAN',
      'robotbarks.futile': 'RESISTANCE IS FUTILE',
      'robotbarks.noEscape': 'THERE IS NO ESCAPE',
      'robotbarks.inferior': 'INFERIOR SPECIES',
      'robotbarks.fearMe': 'FEAR THE ROBOT',
      'robotbarks.curseFuckYou': 'FUCK YOU',
      'robotbarks.curseLoser': 'LOSER',
      'robotbarks.curseDamnYou': 'DAMN YOU',
      'robotbarks.curseRotInHell': 'ROT IN HELL',
      'robotbarks.curseBastard': 'BASTARD',
    },

    es: {
      // <head>
      'doc.title': 'BERZERK!',

      // Menu
      'menu.aria': 'Menú principal',
      'menu.title': 'BERZERK!',
      'menu.subtitle': 'Terror arcade en audio.',
      'menu.start': 'Empezar',
      'menu.help': 'Cómo jugar',
      'menu.learn': 'Aprende los sonidos',
      'menu.highscores': 'Mejores puntuaciones',
      'menu.settings': 'Ajustes',

      // Ready
      'ready.aria': 'Prepárate',
      'ready.title': 'PREPÁRATE',
      'ready.room': 'Sala {n}',

      // Game
      'game.aria': 'Juego',
      'hud.score': 'Puntos',
      'hud.lives': 'Vidas',
      'hud.room': 'Sala',
      'hud.robots': 'Robots',

      // Pause
      'pause.aria': 'Pausa',
      'pause.title': 'Pausa',
      'pause.resume': 'Reanudar',
      'pause.menu': 'Salir al menú',

      // Game over
      'gameover.aria': 'Fin de partida',
      'gameover.title': 'Fin de partida',
      'gameover.finalScore': 'Puntuación final',
      'gameover.room': 'Sala',
      'gameover.enterInitials': '¡Récord! Introduce tus iniciales:',
      'gameover.submit': 'Enviar',
      'gameover.playAgain': 'Jugar otra vez',
      'gameover.highscores': 'Mejores puntuaciones',
      'gameover.menu': 'Menú principal',

      // High scores
      'highscores.aria': 'Mejores puntuaciones',
      'highscores.title': 'Mejores puntuaciones',
      'highscores.empty': 'Aún no hay puntuaciones. Sé el primero.',
      'highscores.back': 'Atrás',
      'highscores.entry': '{rank}. {name} — {score} (sala {room})',

      // Help
      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.intro': 'Sobrevive a las salas de robots. Los muros electrocutan al tocarlos — a ti y a los robots por igual.',
      'help.controlsHeader': 'Controles',
      'help.controlsMove': '<kbd>Flechas</kbd> — moverse (8 direcciones)',
      'help.controlsFire': '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> — disparar. Una tecla sola dispara hacia los cuatro puntos cardinales; pulsa dos a la vez para las diagonales (por ejemplo, <kbd>W</kbd>+<kbd>D</kbd> dispara al noreste). Te quedas quieto mientras disparas.',
      'help.controlsFireNumpad': 'O elige el esquema <em>numpad</em> en Ajustes: <kbd>4</kbd> <kbd>6</kbd> <kbd>8</kbd> <kbd>2</kbd> para los cardinales, <kbd>7</kbd> <kbd>9</kbd> <kbd>1</kbd> <kbd>3</kbd> para las diagonales — una tecla por dirección.',
      'help.controlsExample': 'Para perseguir a un robot al noreste mientras te desplazas hacia el oeste: mantén <kbd>←</kbd> + <kbd>W</kbd> + <kbd>D</kbd>. El movimiento solo lee las flechas; el disparo solo lee WASD o el numpad — los dos grupos de teclas nunca se pisan.',
      'help.controlsPause': '<kbd>Esc</kbd> — pausa',
      'help.controlsF1': '<kbd>F1</kbd> — anunciar puntuación',
      'help.controlsF2': '<kbd>F2</kbd> — anunciar vidas',
      'help.controlsF3': '<kbd>F3</kbd> — anunciar sala',
      'help.controlsF4': '<kbd>F4</kbd> — anunciar robots restantes',
      'help.tipsHeader': 'Consejos',
      'help.tipsWalls': 'Tocar un muro mata. Los robots son tontos — empújalos contra los muros.',
      'help.tipsClearAndExit': 'Matar a todos los robots <strong>no</strong> te hace avanzar solo. Todavía tienes que salir andando por una de las cuatro salidas del muro perimetral. Si limpias la sala antes de salir, te llevas una bonificación (10 puntos por robot) y suena la fanfarria al cruzar; si huyes con robots vivos, Otto el Malvado entra contigo en la siguiente sala. Con <kbd>F4</kbd> consultas cuántos robots quedan.',
      'help.tipsOtto': 'Si te quedas demasiado tiempo, llega Otto el Malvado, rebotando con un tritono. No se le puede matar. Atraviesa muros. Corre.',
      'help.tipsExits': 'Cuando despejas la sala, cada una de las cuatro salidas suena con su propio acorde. El <strong>norte</strong> es brillante y agudo; el <strong>este</strong> es estable y medio; el <strong>sur</strong> es cálido y grave; el <strong>oeste</strong> es profundo y sombrío. Camina hacia el acorde que quieras — cuanto más fuerte y centrado lo oigas, más cerca estás. Mientras queden robots, los acordes permanecen en silencio para que te concentres en el combate.',
      'help.back': 'Atrás',

      // Settings
      'settings.aria': 'Ajustes',
      'settings.title': 'Ajustes',
      'settings.back': 'Atrás',
      'settings.masterVolume': 'Volumen general',
      'settings.voiceVolume': 'Volumen de voz robótica',
      'settings.sfxVolume': 'Volumen de efectos',
      'settings.ambientWallBuzzVolume': 'Volumen del zumbido de muros',
      'settings.useTtsAnnouncer': 'Usar narrador TTS',
      'settings.gamepadEnabled': 'Mando',
      'settings.controlScheme': 'Teclas de disparo',
      'settings.controlScheme.wasdFire': 'WASD',
      'settings.controlScheme.numpadFire': 'Numpad',
      'settings.difficulty': 'Dificultad',
      'settings.difficulty.easy': 'Fácil',
      'settings.difficulty.normal': 'Normal',
      'settings.difficulty.hard': 'Difícil',
      'settings.on': 'Activado',
      'settings.off': 'Desactivado',

      // Language
      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma para los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',

      // Test
      'test.aria': 'Prueba de orientación de audio',
      'test.title': 'Prueba de orientación de audio',
      'test.subtitle': 'Escucha los chasquidos al frente, derecha, detrás e izquierda.',
      'test.intro': 'Deberías oír chasquidos al frente, derecha, detrás e izquierda.',
      'test.dirFront': 'Frente.',
      'test.dirRight': 'Derecha.',
      'test.dirBehind': 'Detrás.',
      'test.dirLeft': 'Izquierda.',
      'test.replay': 'Repetir',
      'test.back': 'Atrás',

      // Learn
      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Pulsa cualquier sonido para escucharlo.',
      'learn.back': 'Atrás',
      'learn.wall': 'Muro eléctrico (chispazo)',
      'learn.wallPerimeter': 'Muro perimetral (zumbido grave)',
      'learn.wallPillar': 'Pilar interior (parpadeo de bobina)',
      'learn.playerStep': 'Tus pasos',
      'learn.footstepGrunt': 'Robot soldado — pasos',
      'learn.footstepFlank': 'Robot ágil — pasos',
      'learn.footstepSniper': 'Robot pesado — pasos',
      'learn.laserGrunt': 'Robot soldado — disparo',
      'learn.laserFlank': 'Robot ágil — disparo',
      'learn.laserSniper': 'Robot pesado — disparo',
      'learn.laserBeam': 'Rayo láser — en vuelo',
      'learn.myLaser': 'Tu láser',
      'learn.robotDeath': 'Muere un robot',
      'learn.wallZap': 'Electrocución en muro',
      'learn.playerHitByLaser': 'Tú — alcanzado por láser',
      'learn.playerHitByWall': 'Tú — alcanzado por muro',
      'learn.playerHitByOtto': 'Tú — alcanzado por Otto el Malvado',
      'learn.ottoBounce': 'Otto el Malvado — rebote tritono',
      'learn.ottoBuzz': 'Otto el Malvado — zumbido de proximidad',
      'learn.barkAlert': 'Robot — ALERTA INTRUSO',
      'learn.barkChicken': 'Robot — GALLINA',
      'learn.barkGotHim': 'Robot — OBJETIVO ELIMINADO',
      'learn.extraLife': 'Vida extra',
      'learn.gameOver': 'Tema de fin de partida',
      'learn.roomCleared': 'Fanfarria de sala limpia',
      'learn.getReady': 'Tono de preparación',

      // Announcer
      'ann.score': 'Puntuación: {score}.',
      'ann.lives': 'Vidas: {lives}.',
      'ann.room': 'Sala {n}.',
      'ann.robots': 'Quedan {n} robots.',
      'ann.robotsAndOtto': 'Quedan {n} robots. Otto el Malvado está aquí.',
      'ann.ottoOnly': 'No quedan robots. Otto el Malvado está aquí.',
      'ann.noRobots': 'Sala limpia.',
      'ann.debugEmpty': 'Modo prueba: sala vacía. Sin robots, sin Otto.',
      'ann.gap.N': 'Salida norte',
      'ann.gap.E': 'Salida este',
      'ann.gap.S': 'Salida sur',
      'ann.gap.W': 'Salida oeste',
      'ann.gap.item': '{header}: {forward} pasos al {forwardDir}, {lateral} al {lateralDir}.',
      'ann.gap.itemAligned': '{header}: {forward} pasos al {forwardDir}, alineada.',
      'ann.gap.withOtto': '{body} Otto está aquí.',
      'ann.getReady': 'Prepárate. Sala {n}.',
      'ann.roomCleared': '¡Sala limpia! Bonificación {bonus}.',
      'ann.extraLife': '¡Vida extra!',
      'ann.caughtByLaser': 'Te alcanzó un láser.',
      'ann.caughtByWall': 'Electrocutado en el muro.',
      'ann.caughtByOtto': 'Te atrapó Otto el Malvado.',
      'ann.gameOverShort': 'Fin de partida.',
      'ann.ottoArrives': '¡Otto el Malvado está aquí!',
      'ann.playing': 'Reproduciendo {label}.',
      'ann.learnHello': 'Explora y escucha cada sonido.',
      'ann.scoreShort': '{score}',
      'ann.dir.north': 'norte',
      'ann.dir.east': 'este',
      'ann.dir.south': 'sur',
      'ann.dir.west': 'oeste',
      'ann.exits.open': 'Libre: {open}.',
      'ann.exits.allOpen': 'Todas las salidas despejadas.',

      // Online leaderboard
      'ann.onlineRank': 'Puesto en línea: número {rank}.',
      'ann.onlineError': 'No se pudo conectar con el ránking en línea. Puntuación guardada localmente.',
      'gameover.nameRequired': 'Escribe un nombre para guardar tu puntuación.',
      'online.posting': 'Enviando tu puntuación…',
      'online.rank': 'Puesto en línea: número {rank}',
      'online.error': 'No se pudo conectar con el ránking. Guardada localmente.',
      'online.viewBoard': 'Ver el ránking mundial',

      // Robot barks — Spanish pool authored independently, NOT translated
      'robotbarks.pools.spotted': ['robotbarks.alert', 'robotbarks.exterminar', 'robotbarks.atrapad'],
      'robotbarks.pools.killAlly': ['robotbarks.vengaremos', 'robotbarks.loPagaras'],
      'robotbarks.pools.flee': ['robotbarks.gallina', 'robotbarks.noEscapara'],
      'robotbarks.pools.spawn': ['robotbarks.alert', 'robotbarks.exterminar'],
      'robotbarks.pools.taunt': ['robotbarks.destruirHumano', 'robotbarks.inutil', 'robotbarks.sinEscape', 'robotbarks.especieInferior', 'robotbarks.tememe'],
      'robotbarks.pools.playerKilled': ['robotbarks.objetivoEliminado', 'robotbarks.humanoCaido', 'robotbarks.blancoNeutralizado'],
      'robotbarks.pools.deathCurse': ['robotbarks.maldicionHijoPuta', 'robotbarks.maldicionCabron', 'robotbarks.maldicionJodete', 'robotbarks.maldicionMaldito', 'robotbarks.maldicionMierda'],
      'robotbarks.alert': 'ALERTA INTRUSO',
      'robotbarks.exterminar': 'EXTERMINAR AL INTRUSO',
      'robotbarks.atrapad': 'ATRAPAD AL HUMANO',
      'robotbarks.objetivoEliminado': 'OBJETIVO ELIMINADO',
      'robotbarks.humanoCaido': 'HUMANO ABATIDO',
      'robotbarks.blancoNeutralizado': 'BLANCO NEUTRALIZADO',
      'robotbarks.gallina': 'GALLINA, LUCHA COMO UN ROBOT',
      'robotbarks.noEscapara': 'EL HUMANO NO ESCAPARÁ',
      'robotbarks.vengaremos': 'VENGAREMOS A NUESTRO ALIADO',
      'robotbarks.loPagaras': 'LO PAGARÁS HUMANO',
      'robotbarks.destruirHumano': 'DESTRUIR AL HUMANO',
      'robotbarks.inutil': 'ES INÚTIL RESISTIRSE',
      'robotbarks.sinEscape': 'NO HAY ESCAPATORIA',
      'robotbarks.especieInferior': 'ESPECIE INFERIOR',
      'robotbarks.tememe': 'TEME AL ROBOT',
      'robotbarks.maldicionHijoPuta': 'HIJO DE PUTA',
      'robotbarks.maldicionCabron': 'CABRÓN',
      'robotbarks.maldicionJodete': 'JÓDETE',
      'robotbarks.maldicionMaldito': 'MALDITO HUMANO',
      'robotbarks.maldicionMierda': 'MIERDA',
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
    const v = lookup(key, current)
    if (Array.isArray(v)) return v
    return format(v, params)
  }

  function applyDom(root) {
    const scope = root || document

    if (scope === document) {
      document.title = t('doc.title')
      document.documentElement.lang = current
    }

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (key) {
        const v = t(key)
        el.textContent = typeof v === 'string' ? v : key
      }
    })

    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html')
      if (key) {
        const v = t(key)
        el.innerHTML = typeof v === 'string' ? v : key
      }
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
