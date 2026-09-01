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
      'menu.subtitle': 'An audio-first submarine hunt. You drive the boat — rudder, throttle and depth — around an open ocean, and convoys cross it on their own courses. Passive sonar beeps every ship’s bearing and range; an active ping reaches further, because the echo comes back later the further away it is. Speed is noise, so the intercept costs you stealth, and when the escorts find you they shoot back. Fire ahead of the target, not at it.',
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

      // Depth. The boat sits at one of four levels - periscope depth, 100,
      // 200 or 300 metres - and crawls between them.
      'depth.periscope': 'periscope depth',
      'depth.metres': '{depth} metres',
      'depth.passing': 'passing {depth} for {target}',

      // Ship types
      'type.freighter': 'freighter',
      'type.tanker': 'tanker',
      'type.liner': 'liner',
      'type.escort': 'escort',

      // Help
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.subtitle': 'Drive the boat. Turn until the beeps go high and fast. Fire ahead of the target.',
      'help.intro': 'You are driving a submarine around an open ocean with fourteen torpedoes and six minutes, and convoys are crossing it on their own courses. Your score is tonnage sunk. Everything you hear is placed BINAURALLY around the boat, so a ship is not merely to your left or right - it is ahead of you, or behind you, or off the quarter, and it moves through that field as you turn. The way you find one is the contact beep. Every ship you can hear beeps every so often, and two things about that beep matter. The GAP between beeps is the range: lazy and slow when a ship is at the edge of hearing, a fast flutter when it is right alongside. The PITCH is whether it is ahead of you or behind you: a bright high tone forward of the beam, dropping to a low tone the moment it slips astern. So you steer toward the beeps, and you know you are steering the right way because they speed up; if one drops to the low tone you have run past it and need to come about. Escorts beep on a harsher square wave, so a threat never sounds like a prize. Your own motor hums underneath all of it and its pitch tracks your speed, so you always know how fast you are going without looking. Speed is also noise: the faster you run the sooner the escorts find you, so closing on a convoy at flank speed is a decision rather than a free move. A ping gives you the range of everything precisely, because each ship answers later the further away it is, and it reaches far beyond the passive beeps - but it is a shout in a quiet room. When the escorts come you will hear one turn and open up, and then they start shooting torpedoes at you - the same weapon you use on them. You hear the launch on its bearing and then a low, warbling run closing in. Each one is unguided and set for the depth you were at when it left the tube, so the way to beat it is to not be there: turn off its track, and above all change depth. Depth is a ladder of four - periscope depth, 100, 200 and 300 metres, on Page Down and Page Up - and the boat crawls between the rungs, fourteen seconds from the top to the bottom and twenty back. That slowness is the whole point. Order the dive when you hear the launch, not when you hear the run, because by then it is already too late. Down there you are quieter and much harder to hit, but the tubes will not fire below periscope depth, you are slower, and the battery only charges at the top of the ladder. One more thing shares the water with you above forty-five metres: the ships themselves. Run into one and you both come off badly - enough of it will sink a freighter, and rather less of it will sink you. To sink a ship, get the boat into position and fire ahead of the target: a torpedo runs at 105 metres a second, so a ship half a kilometre out is nearly five seconds away and will have moved a long way in that time. Aim at where it is going.',
      'help.h.helm': '<kbd>Left</kbd> / <kbd>Right</kbd> (or <kbd>A</kbd> / <kbd>D</kbd>) - rudder. <kbd>Up</kbd> / <kbd>Down</kbd> (or <kbd>W</kbd> / <kbd>Z</kbd>) - throttle. The boat is heavy: it takes a moment to answer the helm, and it will barely turn at all when stopped.',
      'help.h.beeps': 'Every contact beeps. The GAP between beeps is the range - slow at the edge of hearing, a flutter alongside. The PITCH is ahead or astern: bright and high forward of the beam, dropping to a low tone the moment it slips behind you. Steer so the beeps get faster and stay high.',
      'help.h.scope': '<kbd>Q</kbd> / <kbd>E</kbd> - train the periscope up to 45 degrees either side of the bow; <kbd>R</kbd> centres it. Hold <kbd>Shift</kbd> for a fine bearing. The boat does the coarse aiming, the periscope does the fine.',
      'help.h.fire': '<kbd>Space</kbd> - fire a torpedo on the periscope bearing. Three and a half seconds to reload, fourteen for the whole patrol, and the tubes will not fire below periscope depth.',
      'help.h.incoming': 'The escorts shoot torpedoes back. You hear the launch thump on its bearing, then a low warbling run. Each one is unguided and set for the depth you were at when it left the tube, so it is beaten by turning off the track, changing speed, or changing level - and the level change is the one that always works. A fish set for periscope depth passes harmlessly over a boat at 100 metres.',
      'help.h.ram': 'Above 45 metres you and the ships are in the same water. Running into one tears both of you up: the boat takes real damage, and enough of it will sink a ship - a freighter takes two good hits, an escort one. It is a desperate way to score and it makes about the loudest noise in the game.',
      'help.h.ping': '<kbd>S</kbd> - active sonar. Each contact answers late in proportion to its range, so the delay IS the range, and it reaches further than the passive beeps. It is also a shout in a quiet room: the escorts hear every ping you send. (<kbd>P</kbd> still works if that is what your fingers know.)',
      'help.h.sweep': '<kbd>F</kbd> - a quick hydrophone sweep, and the opposite of the ping in every way. It answers instantly, it costs you no noise at all because you are only listening, and you can use it about once a second. In exchange it is vague: the bearing it gives you is smeared by anything up to twenty-odd degrees, and instead of a range it tells you only close, middle distance, or far off. Use it to keep a picture of what is around you and which way to come round; use the ping when you need a number. Going deep muffles it, like everything else the passive set hears.',
      'help.h.depth': '<kbd>Page Down</kbd> / <kbd>Page Up</kbd> - go down or up one level. There are four: periscope depth, 100, 200 and 300 metres. The boat sinks at 21 metres a second and rises at 15, so the cellar is fourteen seconds down and twenty back up. Down there you are quieter and much harder to hit, but you cannot shoot, you are slower, and the battery drains faster the deeper you sit. Order the change early - once you can hear the torpedo it is too late to start.',
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
      'learn.sweep': 'Hydrophone sweep, and what it hears',
      'learn.sweepEmpty': 'Hydrophone sweep - empty water',
      'learn.fire': 'Firing a torpedo',
      'learn.run': 'A torpedo running away from you',
      'learn.hit': 'A hit, and the ship going down',
      'learn.spent': 'A torpedo running out of fuel',
      'learn.acquired': 'They have you',
      'learn.escortTurn': 'An escort turning toward you',
      'learn.escortFire': 'An escort firing a torpedo at you',
      'learn.incoming': 'A torpedo closing - set for YOUR depth',
      'learn.incomingOffDepth': 'The same torpedo - after you have dived clear',
      'learn.passedAbove': 'A torpedo running over you (the dive worked)',
      'learn.enemyHit': 'A torpedo hitting your boat',
      'learn.collision': 'Ramming a ship',
      'learn.dive100': 'Going down one level',
      'learn.dive300': 'Going down to 300 metres (hear how long it takes)',
      'learn.risePeriscope': 'Coming all the way back up',
      'learn.levelPeriscope': 'Levelled off - periscope depth',
      'learn.level300': 'Levelled off - 300 metres',
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
      'ann.blocked.depth': 'Too deep to fire. Come up to periscope depth.',
      'ann.blocked.reload': 'Tube still loading.',
      'ann.blocked.empty': 'No torpedoes left.',
      'ann.pingReport': '{count} contacts. Nearest: {type}, {bearing}, range {range} metres.',
      'ann.noContacts': 'No contacts.',

      // The hydrophone sweep. Bearings and coarse bands only - never a range
      // in metres and never a ship type, because a sweep that reported either
      // would just be a better ping.
      'ann.sweep': 'Sweep: {count}.',
      'ann.sweepItem': '{what}, {bearing}, {band}',
      'ann.sweepEmpty': 'Sweep: nothing in the water.',
      'sweep.merchant': 'Screw',
      'sweep.escort': 'Fast screw',
      'sweep.band.0': 'close',
      'sweep.band.1': 'middle distance',
      'sweep.band.2': 'far off',
      'ann.contacts': '{count} contacts.',
      'ann.contactItem': '{type}, {bearing}, range {range}',
      'ann.solution': '{type}, {bearing}, range {range} metres. Torpedo run {flight} seconds. Lead bearing {lead}: train {off} degrees {side}.',
      'ann.solutionTurn': '{type}, {bearing}, range {range} metres. Torpedo run {flight} seconds. Lead bearing {lead} is outside the periscope arc - turn the boat.',
      'ann.noSolution': 'Periscope {bearing}. Nothing on this bearing.',
      'ann.acquired': 'They have us. Escorts turning.',
      'ann.lostContact': 'Contact lost. They are searching.',
      'ann.incoming': 'Torpedo in the water, {bearing}, running at {depth}!',
      'ann.passedAbove': 'It ran over us.',
      'ann.passedBelow': 'It ran under us.',
      'ann.collision': 'Collision! We have hit a {type}.',
      'ann.rammedDown': 'Rammed the {type} under. {tonnage} tons. {total} tons this patrol.',
      'ann.damage': 'Hull damage. {hull} percent.',
      'ann.diving': 'Take her down to {depth}. {eta} seconds.',
      'ann.surfacing': 'Bring her up to {depth}. {eta} seconds.',
      'ann.levelAt': 'Levelled off at {depth}.',
      'ann.batteryLow': 'Battery low.',
      'ann.batteryDead': 'Battery dead. Blowing tanks for periscope depth.',
      'ann.timeLeft': '{time} seconds remaining.',
      'ann.status': '{tonnage} tons, {sunk} sunk. {torpedoes} torpedoes. Heading {heading}, speed {speed} metres per second, at {depth}. Hull {hull} percent, battery {battery} percent. {time} seconds left.',
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
      'menu.subtitle': 'Una caza submarina sonora. Gobiernas el submarino — timón, máquinas y cota — por mar abierto, y los convoyes lo cruzan con sus propios rumbos. El sonar pasivo pita la demora y la distancia de cada barco; un ping activo llega más lejos, porque el eco vuelve más tarde cuanto más lejos está. La velocidad es ruido, así que la interceptación te cuesta sigilo, y cuando las escoltas te encuentran responden con torpedos. Dispara por delante del blanco, no hacia él.',
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

      'depth.periscope': 'cota periscópica',
      'depth.metres': '{depth} metros',
      'depth.passing': 'pasando {depth} hacia {target}',

      'type.freighter': 'carguero',
      'type.tanker': 'petrolero',
      'type.liner': 'transatlántico',
      'type.escort': 'escolta',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.subtitle': 'Gobierna el submarino. Vira hasta que los pitidos suban y se aceleren. Dispara por delante del blanco.',
      'help.intro': 'Gobiernas un submarino por mar abierto con catorce torpedos y seis minutos, y los convoyes lo cruzan con sus propios rumbos. Tu puntuacion es el tonelaje hundido. Todo lo que oyes esta situado de forma BINAURAL alrededor del submarino, asi que un barco no esta solo a tu izquierda o derecha: esta delante, detras o por la aleta, y se mueve por ese campo segun viras. La forma de encontrarlo es el pitido de contacto. Cada barco que puedes oir pita de vez en cuando, y dos cosas importan. El INTERVALO entre pitidos es la distancia: lento y perezoso cuando esta al limite del alcance, un aleteo rapido cuando esta al costado. La ALTURA dice si esta delante o detras: un tono agudo y brillante por delante del traves, que cae a un tono grave en cuanto pasa por la popa. Asi que gobiernas hacia los pitidos, y sabes que vas bien porque se aceleran; si uno cae al tono grave lo has dejado atras y hay que virar. Las escoltas pitan con una onda cuadrada mas aspera, para que una amenaza nunca suene como un premio. Tu propio motor zumba por debajo de todo esto y su altura sigue tu velocidad, asi que siempre sabes a que marcha vas. La velocidad tambien es ruido: cuanto mas rapido corres, antes te encuentran las escoltas, asi que acercarte a un convoy a toda maquina es una decision, no un movimiento gratis. Un ping te da la distancia exacta de todo, porque cada barco responde mas tarde cuanto mas lejos esta, y llega mucho mas lejos que los pitidos, pero es un grito en una sala en silencio. Cuando lleguen las escoltas oiras una virar y acelerar, y despues empezaran a lanzarte torpedos: la misma arma que tu usas contra ellas. Oyes el lanzamiento en su demora y luego un zumbido grave y ondulante que se acerca. Cada torpedo va sin guia y ajustado a la profundidad a la que estabas cuando salio del tubo, asi que la forma de evitarlo es no estar ahi: vira fuera de su derrota y, sobre todo, cambia de cota. La profundidad es una escala de cuatro peldanos (cota periscopica, 100, 200 y 300 metros, con Av Pag y Re Pag) y el submarino tarda en recorrerla: catorce segundos de arriba abajo y veinte para volver. Esa lentitud es justo el punto. Ordena la inmersion cuando oigas el lanzamiento, no cuando oigas el torpedo, porque entonces ya es tarde. Ahi abajo haces menos ruido y eres mucho mas dificil de alcanzar, pero los tubos no disparan por debajo de cota periscopica, vas mas lento y la bateria solo carga arriba del todo. Por encima de cuarenta y cinco metros compartes el agua con algo mas: los propios barcos. Chocar con uno os deja mal a los dos, y con suficientes golpes se hunde un carguero, o te hundes tu. Para hundir un barco, coloca el submarino y dispara por delante del blanco: un torpedo va a 105 metros por segundo, asi que un barco a medio kilometro esta a casi cinco segundos y se habra movido bastante. Apunta a donde va.',
      'help.h.helm': '<kbd>Izquierda</kbd> / <kbd>Derecha</kbd> (o <kbd>A</kbd> / <kbd>D</kbd>) - timon. <kbd>Arriba</kbd> / <kbd>Abajo</kbd> (o <kbd>W</kbd> / <kbd>Z</kbd>) - maquinas. El submarino es pesado: tarda en obedecer y casi no vira estando parado.',
      'help.h.beeps': 'Cada contacto pita. El INTERVALO entre pitidos es la distancia: lento al limite del alcance, un aleteo al costado. La ALTURA dice proa o popa: agudo y brillante por delante del traves, y cae a un tono grave en cuanto queda por la popa. Gobierna de modo que los pitidos se aceleren y se mantengan agudos.',
      'help.h.scope': '<kbd>Q</kbd> / <kbd>E</kbd> - orienta el periscopio hasta 45 grados a cada banda; <kbd>R</kbd> lo centra. Manten <kbd>Mayus</kbd> para una demora fina. El submarino apunta en grueso, el periscopio en fino.',
      'help.h.fire': '<kbd>Espacio</kbd> - lanza un torpedo en la demora del periscopio. Tres segundos y medio de recarga, catorce en toda la patrulla, y los tubos no disparan por debajo de cota periscopica.',
      'help.h.incoming': 'Las escoltas tambien lanzan torpedos. Oiras el golpe del lanzamiento en su demora y luego un zumbido grave y ondulante. Cada uno va sin guia y ajustado a la profundidad a la que estabas cuando salio del tubo, asi que se evita virando fuera de su derrota, cambiando de velocidad o cambiando de cota, y el cambio de cota siempre funciona. Un torpedo ajustado a cota periscopica pasa por encima de un submarino a 100 metros.',
      'help.h.ram': 'Por encima de 45 metros compartes el agua con los barcos. Chocar con uno os destroza a los dos: el submarino sufre dano real y suficientes golpes hunden al barco: un carguero aguanta dos, una escolta uno. Es una forma desesperada de puntuar y hace el ruido mas fuerte del juego.',
      'help.h.ping': '<kbd>S</kbd> - sonar activo. Cada contacto responde con un retardo proporcional a su distancia, asi que el retardo ES la distancia, y llega mas lejos que los pitidos pasivos. Tambien es un grito en una sala en silencio: las escoltas oyen cada ping que lanzas. (<kbd>P</kbd> sigue funcionando si es lo que tienes en los dedos.)',
      'help.h.sweep': '<kbd>F</kbd> - una escucha rapida del hidrofono, y lo contrario del ping en todo. Responde al instante, no te cuesta nada de ruido porque solo estas escuchando, y puedes usarla mas o menos una vez por segundo. A cambio es imprecisa: la demora que te da esta difuminada hasta unos veinte grados y, en vez de una distancia, solo te dice cerca, a media distancia o lejos. Usala para saber que tienes alrededor y hacia donde virar; usa el ping cuando necesites un numero. Bajar de cota la amortigua, como a todo lo que oye el equipo pasivo.',
      'help.h.depth': '<kbd>Av Pag</kbd> / <kbd>Re Pag</kbd> - bajar o subir una cota. Hay cuatro: cota periscopica, 100, 200 y 300 metros. El submarino baja a 21 metros por segundo y sube a 15, asi que la cota mas profunda esta a catorce segundos de bajada y veinte de subida. Ahi abajo haces menos ruido y eres mucho mas dificil de alcanzar, pero no puedes disparar, vas mas lento y la bateria se agota mas rapido cuanto mas hondo estas. Ordena el cambio pronto: cuando ya oyes el torpedo es tarde para empezar.',
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
      'learn.sweep': 'Escucha del hidrofono y lo que oye',
      'learn.sweepEmpty': 'Escucha del hidrofono: agua vacia',
      'learn.fire': 'Lanzar un torpedo',
      'learn.run': 'Un torpedo alejandose',
      'learn.hit': 'Un impacto, y el barco hundiendose',
      'learn.spent': 'Un torpedo quedandose sin combustible',
      'learn.acquired': 'Te han detectado',
      'learn.escortTurn': 'Una escolta virando hacia ti',
      'learn.escortFire': 'Una escolta lanzandote un torpedo',
      'learn.incoming': 'Un torpedo acercandose - ajustado a TU cota',
      'learn.incomingOffDepth': 'El mismo torpedo - despues de cambiar de cota',
      'learn.passedAbove': 'Un torpedo pasando por encima (funciono)',
      'learn.enemyHit': 'Un torpedo alcanzando tu submarino',
      'learn.collision': 'Embestir a un barco',
      'learn.dive100': 'Bajando una cota',
      'learn.dive300': 'Bajando a 300 metros (escucha lo que tarda)',
      'learn.risePeriscope': 'Subiendo del todo',
      'learn.levelPeriscope': 'Estabilizados - cota periscopica',
      'learn.level300': 'Estabilizados - 300 metros',
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
      'ann.blocked.depth': 'Demasiado hondo para disparar. Sube a cota periscopica.',
      'ann.blocked.reload': 'El tubo aún está cargando.',
      'ann.blocked.empty': 'No quedan torpedos.',
      'ann.pingReport': '{count} contactos. El más cercano: {type}, {bearing}, distancia {range} metros.',
      'ann.noContacts': 'Sin contactos.',

      // La escucha rapida del hidrofono: solo demoras y bandas aproximadas,
      // nunca una distancia en metros ni el tipo de barco.
      'ann.sweep': 'Escucha: {count}.',
      'ann.sweepItem': '{what}, {bearing}, {band}',
      'ann.sweepEmpty': 'Escucha: nada en el agua.',
      'sweep.merchant': 'Helice',
      'sweep.escort': 'Helice rapida',
      'sweep.band.0': 'cerca',
      'sweep.band.1': 'a media distancia',
      'sweep.band.2': 'lejos',
      'ann.contacts': '{count} contactos.',
      'ann.contactItem': '{type}, {bearing}, distancia {range}',
      'ann.solution': '{type}, {bearing}, distancia {range} metros. Recorrido del torpedo {flight} segundos. Demora de adelanto {lead}: gira {off} grados {side}.',
      'ann.solutionTurn': '{type}, {bearing}, distancia {range} metros. Recorrido del torpedo {flight} segundos. La demora de adelanto {lead} queda fuera del arco del periscopio: vira el submarino.',
      'ann.noSolution': 'Periscopio {bearing}. Nada en esta demora.',
      'ann.acquired': 'Nos han detectado. Escoltas virando.',
      'ann.lostContact': 'Contacto perdido. Están buscando.',
      'ann.incoming': '¡Torpedo en el agua, {bearing}, ajustado a {depth}!',
      'ann.passedAbove': 'Ha pasado por encima.',
      'ann.passedBelow': 'Ha pasado por debajo.',
      'ann.collision': '¡Colisión! Hemos chocado con un {type}.',
      'ann.rammedDown': 'Hemos hundido al {type} por embestida. {tonnage} toneladas. {total} toneladas en esta patrulla.',
      'ann.damage': 'Daño en el casco. {hull} por ciento.',
      'ann.diving': 'Bajando a {depth}. {eta} segundos.',
      'ann.surfacing': 'Subiendo a {depth}. {eta} segundos.',
      'ann.levelAt': 'Estabilizados a {depth}.',
      'ann.batteryLow': 'Batería baja.',
      'ann.batteryDead': 'Batería agotada. Purgando lastre hacia cota periscópica.',
      'ann.timeLeft': 'Quedan {time} segundos.',
      'ann.status': '{tonnage} toneladas, {sunk} hundidos. {torpedoes} torpedos. Rumbo {heading}, velocidad {speed} metros por segundo, a {depth}. Casco {hull} por ciento, bateria {battery} por ciento. Quedan {time} segundos.',
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
