/**
 * Lightweight i18n for JOUST. Shared implementation across the collection;
 * only STORAGE_KEY and the dictionaries differ.
 */
app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'joust.lang'

  const localeNames = {
    en: 'English',
    es: 'Español',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Joust',

      // Menu
      'menu.aria': 'Main menu',
      'menu.title': 'Joust',
      'menu.subtitle': 'An audio-first flying duel. You have no altitude control, only a wing: each flap buys a little height against gravity. When two riders collide the HIGHER one wins outright, and every rider’s altitude relative to yours IS its pitch — a threat above you sings above the reference tone, prey below you sings under it, and a rider level with you beats against it, because that collision is a coin flip. Kill one and it drops an egg that falls, ticks, and hatches into something worse.',
      'menu.start': 'Take flight',
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
      'game.aria': 'The arena',
      'hud.score': 'Score',
      'hud.lives': 'Lives',
      'hud.wave': 'Wave',
      'hud.altitude': 'Altitude',
      'hud.riders': 'Riders',
      'hud.eggs': 'Eggs',
      'hud.onDeck': 'on the deck',

      // Which side of you something is. The arena wraps, so an offset is always
      // taken the short way round.
      'dir.left': '{dist} to your left',
      'dir.right': '{dist} to your right',
      'dir.onYou': 'right on top of you',

      // Relative altitude, which is the thing pitch encodes.
      'height.above': '{alt} above you',
      'height.below': '{alt} below you',
      'height.level': 'level with you',

      // What happens if you touch it right now.
      'verdict.win': 'you win it',
      'verdict.lose': 'it kills you',
      'verdict.bounce': 'you bounce',

      // Rider tiers
      'type.bounder': 'bounder',
      'type.hunter': 'hunter',
      'type.shadowlord': 'shadow lord',

      // Help
      'help.aria': 'How to play',
      'help.title': 'How to play',
      'help.subtitle': 'Flap to climb. Be the higher rider. Collect the egg before it hatches.',
      'help.intro': 'You are riding a mount over a wrapping strip of air with a solid deck below and a hard roof above, and enemy riders share it with you. There is exactly one combat rule: when two riders touch, the HIGHER one wins outright. No health, no hit points — just who was above whom at the moment of contact. Everything else in the game exists to make that one comparison something you can hear. Altitude is PITCH, and it is always relative to YOU. A quiet reference tone runs the whole time you are alive; that tone is your own height. Every rider you can hear beats its wings at a pitch set by how far above or below you it is, so a rider singing ABOVE the reference is above you and will kill you, and one singing UNDER it is below you and is yours for the taking. A rider level with you lands within a few hertz of the reference and BEATS against it, a wavering, unstable sound — which is exactly right, because that collision is a coin flip that throws you both apart. Left and right is the other axis, and it is carried by stereo rather than pitch, so the two never get in each other’s way: a rider is placed where it actually is, and the rate of its wing beats speeds up as it closes on you. That accelerating beat is your alarm. Your own wing is the one sound in the game that is not pitched by altitude, so it always reads as you. Flapping is not a held control — you pump it, and each beat buys a little height against constant gravity, so a climb is four seconds of sustained work rather than one keypress. That cost is the whole tension: when something is above you, the answer is always to climb, and climbing is never free. Sideways you have real momentum and poor air control, so turning around in mid-air takes time you may not have. Because pitch is relative it can never tell you your absolute height, so the deck and the roof announce themselves: a low wash rises as you near the floor, a thin hiss as you near the ceiling. Kill a rider and it drops an egg. The egg falls — you can hear its voice descend as it goes — lands, and starts ticking, and the tick accelerates as it approaches hatching. Fly into it to collect it, and consecutive eggs in one wave are worth more and more. Ignore it and it hatches into a rider one tier meaner than the one you just killed, which is the only thing in the game that punishes you for being lazy rather than for being wrong. A wave is over when the air and the deck are both clear, so an egg you never went back for keeps the wave alive until it hatches.',
      'help.h.flap': '<kbd>Space</kbd> (or <kbd>Up</kbd>) — flap. This is a press, not a hold: pump it. Each beat adds height against constant gravity, and about five beats a second is the most the wing will give you.',
      'help.h.move': '<kbd>Left</kbd> / <kbd>Right</kbd> — lean into it. Air control is deliberately poor and momentum carries you, so turning around in mid-air takes time. On the deck you are much more responsive, and much lower than everything in the sky.',
      'help.h.pitch': 'ALTITUDE IS PITCH, relative to you. The reference tone that runs under everything is your own height. A rider above the reference is above you and wins the collision; below the reference is below you and loses it. Level with you, it beats against the reference — a wavering sound that means a bounce.',
      'help.h.stereo': 'LEFT AND RIGHT IS STEREO. Riders are placed where they are, and the RATE of their wing beats speeds up as they close on you. A quickening beat off to one side is a rider committing to you.',
      'help.h.duel': 'When you touch a rider, the higher one wins. Above it, you unhorse it and it drops an egg. Below it, you lose a life. Within a couple of units either way, you both bounce apart — survivable, and often the best you can do.',
      'help.h.tiers': 'Three kinds of rider, each on its own waveform: a bounder is soft and mostly minds its own business, a hunter is harsher and comes for you more often, and a shadow lord is a hard square wave that comes for you almost always and can outclimb you.',
      'help.h.eggs': 'An unhorsed rider drops an egg. It falls — its voice descends as it goes — lands, and ticks, and the tick accelerates toward hatching. Fly into it to collect. Consecutive eggs in one wave are worth 250, 500, 750, then 1000. Let one hatch and it comes back one tier meaner.',
      'help.h.bounds': 'A low wash rises as you near the deck and a thin hiss as you near the roof. They are the only cues that carry your absolute height, because a relative pitch mapping cannot.',
      'help.h.lives': 'Three lives, and another every 20,000 points. You come back briefly invulnerable, which you can hear as a tremolo on the reference tone.',
      'help.h.status': '<kbd>F1</kbd> you — score, lives, wave, altitude. <kbd>F2</kbd> the nearest rider, and what happens if you touch it. <kbd>F3</kbd> everything in the air and on the deck.',
      'help.h.pause': '<kbd>Escape</kbd> — pause.',
      'help.audio': 'Headphones are strongly recommended. Left and right is doing half the work here, and the reference tone — which is what makes every other pitch mean something — is quiet on purpose so it sits under the game rather than in front of it.',
      'help.back': 'Back',

      // Learn the sounds
      'learn.aria': 'Learn the sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Play each cue on its own. Start with the three verdicts — they are the whole game.',
      'learn.reference': 'The reference tone — this is YOUR altitude',
      'learn.riderLevel': 'A rider LEVEL with you (hear it beat against the reference) — a bounce',
      'learn.riderAbove': 'A rider ABOVE you (higher than the reference) — it kills you',
      'learn.riderBelow': 'A rider BELOW you (lower than the reference) — you kill it',
      'learn.riderLeft': 'A rider to your left',
      'learn.riderRight': 'A rider to your right',
      'learn.riderFar': 'A rider right across the arena',
      'learn.riderClosing': 'A rider closing on you (hear the beat rate ramp)',
      'learn.bounder': 'A bounder',
      'learn.hunter': 'A hunter',
      'learn.shadowlord': 'A shadow lord',
      'learn.sustain': 'A rider close enough to fight, climbing past you',
      'learn.flap': 'Your own wing beat',
      'learn.flapGround': 'Taking off from the deck',
      'learn.land': 'Landing on the deck',
      'learn.ceiling': 'Hitting the roof',
      'learn.deck': 'Coming down onto the deck (the low wash)',
      'learn.roof': 'Rising toward the roof (the thin hiss)',
      'learn.kill': 'Unhorsing a rider',
      'learn.bounce': 'A bounce — neither of you was higher',
      'learn.death': 'Being unhorsed yourself',
      'learn.arrive': 'A rider arriving',
      'learn.eggFall': 'An egg falling past you, and landing',
      'learn.eggTick': 'The hatch clock, from just landed to about to go',
      'learn.eggCollect': 'Collecting an egg',
      'learn.hatch': 'An egg hatching — the sound you do not want',
      'learn.waveStart': 'A wave beginning',
      'learn.waveClear': 'A wave cleared',
      'learn.extraLife': 'An extra life',
      'learn.respawn': 'Coming back',
      'learn.hurry': 'The wave has dragged on — everything speeds up',
      'learn.over': 'Game over',
      'learn.back': 'Back',

      // Stereo test
      'test.aria': 'Audio test',
      'test.title': 'Audio test',
      'test.subtitle': 'Two axes, two channels. Left and right is stereo; up and down is pitch against the reference.',
      'test.left': 'Play far to the left',
      'test.right': 'Play far to the right',
      'test.centre': 'Play dead centre',
      'test.up': 'Play well above you (high against the reference)',
      'test.down': 'Play well below you (low against the reference)',
      'test.sweep': 'Sweep left to right',
      'test.ladder': 'The whole pitch ladder, bottom to top',
      'test.back': 'Back',

      // Pause
      'pause.aria': 'Paused',
      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.restart': 'Start again',
      'pause.menu': 'Main menu',

      // Game over
      'gameover.aria': 'Game over',
      'gameover.title': 'Unhorsed',
      'gameover.subtitle': 'Enter your name to save your score.',
      'gameover.score': 'Score: {score}',
      'gameover.name': 'Your name',
      'gameover.save': 'Save score',
      'gameover.continue': 'Continue',
      'gameover.nameRequired': 'Enter a name first.',

      // Online leaderboard status, shown on the game over screen.
      'online.posting': 'Posting to the leaderboard...',
      'online.rank': 'Online rank number {rank}.',
      'online.viewBoard': 'View the leaderboard',
      'online.error': 'Leaderboard unavailable. Saved on this device.',

      // High scores
      'highscores.aria': 'High scores',
      'highscores.title': 'High scores',
      'highscores.subtitle': 'Your best flights on this device.',
      'highscores.empty': 'No flights recorded yet.',
      'highscores.entry': '{rank}. {name} — {score} (wave {wave})',
      'highscores.back': 'Back',

      // Announcements
      'ann.ready': 'Mount up. Three.',
      'ann.two': 'Two.',
      'ann.one': 'One.',
      'ann.paused': 'Paused.',
      'ann.resumed': 'Resumed.',
      'ann.wave': 'Wave {wave}. {riders} riders.',
      'ann.waveClear': 'Wave {wave} cleared. Bonus {bonus}. Score {total}.',
      'ann.hurry': 'They are getting impatient.',
      'ann.unhorsed': '{type} unhorsed, {score}. {remaining} left.',
      'ann.egg': 'Egg, {score}. Score {total}.',
      'ann.hatch': 'It hatched — {type}, {side}!',
      'ann.death': 'Unhorsed. {lives} lives left.',
      'ann.lastLife': 'Unhorsed.',
      'ann.respawn': 'Back in the air. Briefly shielded.',
      'ann.exposed': 'Shield gone.',
      'ann.extraLife': 'Extra life. {lives} in hand.',
      'ann.status': 'Score {score}. {lives} lives, wave {wave}. Altitude {altitude} of {ceiling}. {riders} riders, {eggs} eggs.',
      'ann.nearest': '{type}, {side}, {height}: {verdict}. Climb {climb} to beat it.',
      'ann.noRiders': 'The air is clear.',
      'ann.clearAir': 'The air is clear and the deck is clear.',
      'ann.fieldRider': '{type}, {side}, {height}',
      'ann.fieldEgg': 'Egg {side}, {time} seconds to hatch',
      'ann.fieldEggFalling': 'Egg falling, {side}',
      'ann.gameOver': 'Game over. {score} points, wave {wave}.',
      'ann.gameOverHigh': 'Game over. {score} points — a high score!',
      'ann.scoreSaved': 'Score saved.',
      'ann.onlineRank': 'Online rank number {rank}.',
      'ann.onlineError': 'Leaderboard unavailable. Saved on this device.',
    },

    es: {
      'doc.title': 'Joust',

      'menu.aria': 'Menú principal',
      'menu.title': 'Joust',
      'menu.subtitle': 'Un duelo aéreo sonoro. No controlas la altura, solo tienes un ala: cada aletazo te compra un poco de altura contra la gravedad. Cuando dos jinetes chocan, gana el que está MÁS ALTO, y la altura de cada jinete respecto a la tuya ES su tono: una amenaza por encima suena por encima del tono de referencia, una presa por debajo suena por debajo, y un jinete a tu misma altura bate contra la referencia, porque ese choque es cara o cruz. Derriba a uno y suelta un huevo que cae, hace tictac y eclosiona en algo peor.',
      'menu.start': 'Alzar el vuelo',
      'menu.help': 'Cómo jugar',
      'menu.highscores': 'Puntuaciones',
      'menu.learn': 'Aprende los sonidos',

      'language.aria': 'Elegir idioma',
      'language.title': 'Idioma',
      'language.subtitle': 'Elige el idioma de los menús y los anuncios.',
      'language.back': 'Atrás',
      'language.button': 'Idioma',
      'menu.quit': 'Volver a la lista de juegos',

      'game.aria': 'La arena',
      'hud.score': 'Puntos',
      'hud.lives': 'Vidas',
      'hud.wave': 'Oleada',
      'hud.altitude': 'Altura',
      'hud.riders': 'Jinetes',
      'hud.eggs': 'Huevos',
      'hud.onDeck': 'en el suelo',

      'dir.left': '{dist} a tu izquierda',
      'dir.right': '{dist} a tu derecha',
      'dir.onYou': 'justo encima de ti',

      'height.above': '{alt} por encima de ti',
      'height.below': '{alt} por debajo de ti',
      'height.level': 'a tu misma altura',

      'verdict.win': 'ganas tú',
      'verdict.lose': 'te mata',
      'verdict.bounce': 'rebotáis',

      'type.bounder': 'saltador',
      'type.hunter': 'cazador',
      'type.shadowlord': 'señor de las sombras',

      'help.aria': 'Cómo jugar',
      'help.title': 'Cómo jugar',
      'help.subtitle': 'Aletea para subir. Sé el jinete más alto. Recoge el huevo antes de que eclosione.',
      'help.intro': 'Montas sobre una franja de aire que se enrolla sobre si misma, con un suelo solido debajo y un techo duro encima, y hay jinetes enemigos compartiendola contigo. Hay exactamente una regla de combate: cuando dos jinetes se tocan, gana el que esta MAS ALTO. Sin vida, sin puntos de golpe: solo quien estaba encima de quien en el momento del contacto. Todo lo demas existe para que esa unica comparacion sea algo que puedas oir. La altura es TONO, y siempre relativa a TI. Un tono de referencia suave suena todo el tiempo que estas vivo; ese tono es tu propia altura. Cada jinete que puedes oir bate las alas a un tono fijado por cuanto esta por encima o por debajo de ti, asi que un jinete que suena POR ENCIMA de la referencia esta por encima de ti y te matara, y uno que suena POR DEBAJO esta por debajo y es tuyo. Un jinete a tu misma altura cae a pocos hercios de la referencia y BATE contra ella, un sonido ondulante e inestable, que es exactamente lo correcto, porque ese choque es cara o cruz y os lanza a los dos en direcciones opuestas. Izquierda y derecha es el otro eje, y lo lleva el estereo en vez del tono, asi que los dos nunca se estorban: un jinete suena donde realmente esta, y la frecuencia de sus aletazos se acelera segun se acerca. Ese aletazo acelerando es tu alarma. Tu propia ala es el unico sonido del juego que no esta afinado por la altura, asi que siempre se lee como tu. Aletear no es un control mantenido: lo bombeas, y cada batida compra un poco de altura contra la gravedad constante, asi que subir del todo son cuatro segundos de trabajo sostenido y no una tecla. Ese coste es toda la tension: cuando algo esta por encima de ti la respuesta es siempre subir, y subir nunca es gratis. De lado tienes inercia real y poco control en el aire, asi que darte la vuelta en pleno vuelo lleva un tiempo que quiza no tengas. Como el tono es relativo, nunca puede decirte tu altura absoluta, asi que el suelo y el techo se anuncian solos: un rumor grave crece al acercarte al suelo, y un siseo fino al acercarte al techo. Derriba a un jinete y suelta un huevo. El huevo cae, y oyes su voz descender mientras baja, aterriza y empieza a hacer tictac, y el tictac se acelera segun se acerca la eclosion. Vuela hacia el para recogerlo, y los huevos consecutivos de una misma oleada valen cada vez mas. Ignoralo y eclosionara en un jinete un escalon peor que el que acabas de derribar, que es lo unico del juego que te castiga por perezoso en vez de por equivocado. Una oleada termina cuando el aire y el suelo estan limpios, asi que un huevo al que nunca volviste mantiene viva la oleada hasta que eclosione.',
      'help.h.flap': '<kbd>Espacio</kbd> (o <kbd>Arriba</kbd>) — aletear. Es una pulsación, no un mantenido: bombéalo. Cada batida suma altura contra la gravedad, y unas cinco por segundo es todo lo que el ala te dará.',
      'help.h.move': '<kbd>Izquierda</kbd> / <kbd>Derecha</kbd> — inclínate. El control en el aire es pobre a propósito y la inercia te lleva, así que darte la vuelta lleva tiempo. En el suelo respondes mucho mejor, y estás mucho más bajo que todo lo que vuela.',
      'help.h.pitch': 'LA ALTURA ES TONO, relativa a ti. El tono de referencia que suena bajo todo lo demás es tu propia altura. Un jinete por encima de la referencia está por encima de ti y gana el choque; por debajo, pierde. A tu misma altura bate contra la referencia: un sonido ondulante que significa rebote.',
      'help.h.stereo': 'IZQUIERDA Y DERECHA ES ESTÉREO. Los jinetes suenan donde están, y la FRECUENCIA de sus aletazos se acelera según se acercan. Un aleteo que se acelera a un lado es un jinete que va a por ti.',
      'help.h.duel': 'Cuando tocas a un jinete, gana el más alto. Por encima, lo derribas y suelta un huevo. Por debajo, pierdes una vida. A un par de unidades en cualquier sentido, rebotáis los dos: se sobrevive, y a menudo es lo mejor que puedes hacer.',
      'help.h.tiers': 'Tres clases de jinete, cada una con su onda: el saltador es suave y va a lo suyo, el cazador es más áspero y va a por ti más a menudo, y el señor de las sombras es una onda cuadrada dura que casi siempre va a por ti y puede subir más que tú.',
      'help.h.eggs': 'Un jinete derribado suelta un huevo. Cae — su voz desciende mientras baja —, aterriza y hace tictac, y el tictac se acelera hacia la eclosión. Vuela hacia él para recogerlo. Los huevos consecutivos de una oleada valen 250, 500, 750 y luego 1000. Si dejas que eclosione, vuelve un escalón peor.',
      'help.h.bounds': 'Un rumor grave crece cerca del suelo y un siseo fino cerca del techo. Son las únicas señales que llevan tu altura absoluta, porque un tono relativo no puede.',
      'help.h.lives': 'Tres vidas, y otra cada 20.000 puntos. Vuelves brevemente invulnerable, y lo oyes como un trémolo sobre el tono de referencia.',
      'help.h.status': '<kbd>F1</kbd> tú — puntos, vidas, oleada, altura. <kbd>F2</kbd> el jinete más cercano, y qué pasa si lo tocas. <kbd>F3</kbd> todo lo que hay en el aire y en el suelo.',
      'help.h.pause': '<kbd>Escape</kbd> — pausa.',
      'help.audio': 'Se recomiendan auriculares. La izquierda y la derecha hacen la mitad del trabajo, y el tono de referencia — que es lo que da sentido a todos los demás tonos — es discreto a propósito, para quedar debajo del juego y no delante.',
      'help.back': 'Atrás',

      'learn.aria': 'Aprende los sonidos',
      'learn.title': 'Aprende los sonidos',
      'learn.subtitle': 'Escucha cada señal por separado. Empieza por los tres veredictos: son todo el juego.',
      'learn.reference': 'El tono de referencia — esta es TU altura',
      'learn.riderLevel': 'Un jinete A TU MISMA ALTURA (oye cómo bate contra la referencia) — rebote',
      'learn.riderAbove': 'Un jinete POR ENCIMA de ti (más agudo que la referencia) — te mata',
      'learn.riderBelow': 'Un jinete POR DEBAJO de ti (más grave que la referencia) — lo matas tú',
      'learn.riderLeft': 'Un jinete a tu izquierda',
      'learn.riderRight': 'Un jinete a tu derecha',
      'learn.riderFar': 'Un jinete al otro lado de la arena',
      'learn.riderClosing': 'Un jinete acercándose (oye acelerar el aleteo)',
      'learn.bounder': 'Un saltador',
      'learn.hunter': 'Un cazador',
      'learn.shadowlord': 'Un señor de las sombras',
      'learn.sustain': 'Un jinete lo bastante cerca para pelear, subiendo a tu lado',
      'learn.flap': 'Tu propio aletazo',
      'learn.flapGround': 'Despegar del suelo',
      'learn.land': 'Aterrizar en el suelo',
      'learn.ceiling': 'Chocar con el techo',
      'learn.deck': 'Bajar hacia el suelo (el rumor grave)',
      'learn.roof': 'Subir hacia el techo (el siseo fino)',
      'learn.kill': 'Derribar a un jinete',
      'learn.bounce': 'Un rebote — ninguno estaba más alto',
      'learn.death': 'Que te derriben a ti',
      'learn.arrive': 'Llega un jinete',
      'learn.eggFall': 'Un huevo cayendo a tu lado, y aterrizando',
      'learn.eggTick': 'El reloj de la eclosión, de recién caído a punto de romper',
      'learn.eggCollect': 'Recoger un huevo',
      'learn.hatch': 'Un huevo eclosionando — el sonido que no quieres',
      'learn.waveStart': 'Empieza una oleada',
      'learn.waveClear': 'Oleada superada',
      'learn.extraLife': 'Vida extra',
      'learn.respawn': 'Volver',
      'learn.hurry': 'La oleada se alarga — todo se acelera',
      'learn.over': 'Fin de la partida',
      'learn.back': 'Atrás',

      'test.aria': 'Prueba de audio',
      'test.title': 'Prueba de audio',
      'test.subtitle': 'Dos ejes, dos canales. Izquierda y derecha es estéreo; arriba y abajo es tono contra la referencia.',
      'test.left': 'Sonar lejos a la izquierda',
      'test.right': 'Sonar lejos a la derecha',
      'test.centre': 'Sonar justo en el centro',
      'test.up': 'Sonar muy por encima de ti (agudo contra la referencia)',
      'test.down': 'Sonar muy por debajo de ti (grave contra la referencia)',
      'test.sweep': 'Barrido de izquierda a derecha',
      'test.ladder': 'Toda la escala de tonos, de abajo a arriba',
      'test.back': 'Atrás',

      'pause.aria': 'Pausa',
      'pause.title': 'Pausa',
      'pause.resume': 'Continuar',
      'pause.restart': 'Empezar de nuevo',
      'pause.menu': 'Menú principal',

      'gameover.aria': 'Fin de la partida',
      'gameover.title': 'Derribado',
      'gameover.subtitle': 'Escribe tu nombre para guardar la puntuación.',
      'gameover.score': 'Puntuación: {score}',
      'gameover.name': 'Tu nombre',
      'gameover.save': 'Guardar',
      'gameover.continue': 'Continuar',
      'gameover.nameRequired': 'Escribe un nombre primero.',

      'online.posting': 'Enviando a la clasificación...',
      'online.rank': 'Puesto {rank} en línea.',
      'online.viewBoard': 'Ver la clasificación',
      'online.error': 'Clasificación no disponible. Guardado en este dispositivo.',

      'highscores.aria': 'Puntuaciones',
      'highscores.title': 'Puntuaciones',
      'highscores.subtitle': 'Tus mejores vuelos en este dispositivo.',
      'highscores.empty': 'Aún no hay vuelos registrados.',
      'highscores.entry': '{rank}. {name} — {score} (oleada {wave})',
      'highscores.back': 'Atrás',

      'ann.ready': 'A la montura. Tres.',
      'ann.two': 'Dos.',
      'ann.one': 'Uno.',
      'ann.paused': 'Pausa.',
      'ann.resumed': 'Continuamos.',
      'ann.wave': 'Oleada {wave}. {riders} jinetes.',
      'ann.waveClear': 'Oleada {wave} superada. Bonus {bonus}. Puntuación {total}.',
      'ann.hurry': 'Se están impacientando.',
      'ann.unhorsed': '{type} derribado, {score}. Quedan {remaining}.',
      'ann.egg': 'Huevo, {score}. Puntuación {total}.',
      'ann.hatch': '¡Ha eclosionado — {type}, {side}!',
      'ann.death': 'Te han derribado. Quedan {lives} vidas.',
      'ann.lastLife': 'Te han derribado.',
      'ann.respawn': 'De vuelta al aire. Protegido un momento.',
      'ann.exposed': 'Se acabó la protección.',
      'ann.extraLife': 'Vida extra. Tienes {lives}.',
      'ann.status': 'Puntuación {score}. {lives} vidas, oleada {wave}. Altura {altitude} de {ceiling}. {riders} jinetes, {eggs} huevos.',
      'ann.nearest': '{type}, {side}, {height}: {verdict}. Sube {climb} para ganarle.',
      'ann.noRiders': 'El aire está limpio.',
      'ann.clearAir': 'El aire y el suelo están limpios.',
      'ann.fieldRider': '{type}, {side}, {height}',
      'ann.fieldEgg': 'Huevo {side}, {time} segundos para eclosionar',
      'ann.fieldEggFalling': 'Huevo cayendo, {side}',
      'ann.gameOver': 'Fin de la partida. {score} puntos, oleada {wave}.',
      'ann.gameOverHigh': 'Fin de la partida. ¡{score} puntos — récord!',
      'ann.scoreSaved': 'Puntuación guardada.',
      'ann.onlineRank': 'Puesto {rank} en línea.',
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
