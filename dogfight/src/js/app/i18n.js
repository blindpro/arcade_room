app.i18n = (() => {
  const FALLBACK = 'en'
  const STORAGE_KEY = 'dogfight.lang'

  const localeNames = {
    en: 'English',
  }

  const dictionaries = {
    en: {
      'doc.title': 'Dogfight - accessible audio arena',
      'splash.instruction': 'Press any key to begin',
      'splash.author': 'audio-first arena',

      'menu.aria': 'Main menu',
      'menu.title': 'Dogfight',
      'menu.subtitle': 'An audio-first accessible plane combat arena.',
      'menu.play': 'Single player',
      'menu.learn': 'Learn the sounds',
      'menu.help': 'Help',
      'menu.language': 'Language',
      'menu.quit': 'Return to Games List',
      'menu.footerSuffix': ' - headphones strongly recommended',

      'language.aria': 'Choose language',
      'language.title': 'Language',
      'language.subtitle': 'Choose the language used for menus and announcements.',
      'language.back': 'Back',

      'setup.aria': 'Single-player setup',
      'setup.title': 'Single player',
      'setup.subtitle': 'Choose a game mode.',
      'setup.modeFfa': 'Free For All',
      'setup.modeTeamDm': '2v2 Duel',
      'setup.modeSurvival': 'Survival — survive endless waves',
      'setup.teamSubtitle': 'You and one wingman against 2 enemy pilots. Best of 3 rounds.',
      'setup.ffaSubtitle': 'Choose how many AI pilots to fight. Zero is sandbox mode for learning movement and audio.',
      'setup.titleSurvival': 'Survival',
      'setup.survivalSubtitle': 'Choose how many starting opponents. When you eliminate one, a new challenger enters the sky.',
      'setup.ai0': 'Sandbox - no opponents',
      'setup.ai1': '1 opponent',
      'setup.ai2': '2 opponents',
      'setup.ai3': '3 opponents',
      'setup.ai4': '4 opponents',
      'setup.ai5': '5 opponents (full sky)',
      'setup.back': 'Back',

      'game.round': 'Round: ',
      'game.matchScore': 'Match: ',
      'game.aria': 'Dogfight arena',
      'game.instructions': 'Arrow keys fly. Space fires machine guns. G fires a locked missile. F calls wingman beacon. Shift boosts. A and D quick turn. S turnaround. Q sweeps. F1 score, F2 planes, F3 target, F4 health. Escape to quit.',
      'game.health': 'Health: ',
      'game.score': 'Score: ',
      'game.planes': 'Planes left: ',
      'game.planesSurvival': 'Kills: ',
      'game.ended': 'Game ended.',
      'game.gunsCooldown': 'Guns cooling.',
      'game.noMissiles': 'No missiles left.',
      'game.noMissileLock': 'No missile lock.',
      'game.missileCooldown': 'Missile rail cooling.',

      'gameOver.aria': 'Round over',
      'gameOver.titleWin': 'You won!',
      'gameOver.titleLose': 'Round over',
      'gameOver.titleTeamWin': 'Your team won!',
      'gameOver.titleTeamLose': 'Match over',
      'gameOver.resultWin': 'Last plane alive.',
      'gameOver.resultLose': 'Better luck next sortie.',
      'gameOver.resultSurvival': 'You eliminated {kills} opponents.',
      'gameOver.kills': 'Kills',
      'gameOver.resultWinDm': 'Last plane alive.',
      'gameOver.resultLoseDm': 'Better luck next sortie.',
      'gameOver.resultTeamWin': 'Your team won the match.',
      'gameOver.resultTeamLose': 'Your team lost the match.',
      'gameOver.roundScore': 'Round score',
      'gameOver.matchScore': 'Match {playerWins} - {enemyWins}',
      'gameOver.score': 'Score',
      'gameOver.best': 'Personal Best',
      'gameOver.rematch': 'Play again',
      'gameOver.menu': 'Back to main menu',
      'gameOver.summaryWin': 'You won. Score {score}. Personal best {best}.',
      'gameOver.summarySurvival': 'Game over. {kills} kills. Personal best {best}.',
      'gameOver.summaryLose': 'Round over. Score {score}. Personal best {best}.',
      'gameOver.summaryTeamWin': 'Your team won the match {playerWins} to {enemyWins}. Score {score}. Personal best {best}.',
      'gameOver.summaryTeamLose': 'Match over. The enemy won {enemyWins} to {playerWins}. Score {score}. Personal best {best}.',
      'gameOver.standings': 'Final standings',
      'gameOver.standingNameYou': '{label} (you)',
      'gameOver.standingTagWinner': 'survived',
      'gameOver.standingTagOut': 'shot down',
      'gameOver.standingsAnnounce': 'Final standings: {list}.',

      'help.aria': 'Help',
      'help.title': 'How to play',
      'help.controls': 'Controls',
      'help.controlUp': '<kbd>Up</kbd> - throttle up',
      'help.controlDown': '<kbd>Down</kbd> - air brake / throttle down',
      'help.controlSteer': '<kbd>Left</kbd> <kbd>Right</kbd> - bank and turn',
      'help.controlGun': '<kbd>Space</kbd> - fire machine guns (hold; overheats)',
      'help.controlMissile': '<kbd>G</kbd> - fire missile when locked',
      'help.controlWingman': '<kbd>F</kbd> - wingman position beacon',
      'help.controlBoost': '<kbd>Shift</kbd> - speed boost',
      'help.controlSharpTurn': '<kbd>A</kbd> <kbd>D</kbd> - quick sharp turn (costs stability)',
      'help.controlTurnaround': '<kbd>S</kbd> - 180° turnaround (costs stability)',
      'help.controlSweep': '<kbd>Q</kbd> - announce enemy planes and their bearing',
      'help.controlReadouts': '<kbd>F1</kbd> score, <kbd>F2</kbd> planes left, <kbd>F3</kbd> nearest target, <kbd>F4</kbd> health',
      'help.controlEscape': '<kbd>Escape</kbd> - quit to menu',
      'help.controlConfirm': '<kbd>Enter</kbd> / <kbd>Space</kbd> - confirm in menus',
      'help.howSounds': 'How it sounds',
      'help.sounds1': 'Each plane has a spatial engine voice. Planes in front sound brighter; planes behind sound darker.',
      'help.sounds2': 'A missile lock tone tightens as an enemy enters your nose cone. Incoming missiles warn from their direction.',
      'help.sounds3': 'Gunfire chips health, missiles hit hard, and ramming causes huge damage to both planes.',
      'help.goal': 'Goal',
      'help.goalText': 'Be the last plane alive. Damage you deal scores points; eliminations and survival score bonuses.',
      'help.back': 'Back',

      'learn.aria': 'Learn the game sounds',
      'learn.title': 'Learn the sounds',
      'learn.subtitle': 'Press a button to preview each sound.',
      'learn.back': 'Back',
      'learn.uiFocus': 'UI focus tick',
      'learn.uiBack': 'UI back tick',
      'learn.roundStart': 'Round start chimes',
      'learn.roundEndWin': 'Round end (you win)',
      'learn.roundEndLose': 'Round end (you lose)',
      'learn.collisionLight': 'Light ram',
      'learn.collisionHeavy': 'Heavy ram',
      'learn.scoringSmall': 'Scoring chime - small hit',
      'learn.scoringBig': 'Scoring chime - big hit',
      'learn.buzzerLight': 'Damage warning - light',
      'learn.buzzerHard': 'Damage warning - hard',
      'learn.wallScrape': 'Boundary wind',
      'learn.elimination': 'Plane shot down',
      'learn.heartbeat': 'Low-health pulse',
      'learn.proximityFront': 'Targeting beep - plane in front',
      'learn.proximityBehind': 'Targeting beep - plane behind',
      'learn.wallProximity': 'Boundary whoosh - far to near',
      'learn.engine': 'Engine: {color} plane',

      'color.red': 'red',
      'color.blue': 'blue',
      'color.green': 'green',
      'color.yellow': 'yellow',
      'color.purple': 'purple',
      'color.orange': 'orange',

      'ann.you': 'You',
      'ann.roundStart1': 'Round start. 1 enemy pilot. Engage.',
      'ann.roundStartN': 'Round start. {count} enemy pilots. Engage.',
      'ann.sandbox': 'Sandbox mode. Fly freely.',
      'ann.roundTeam1': 'Round 1. You and your wingman versus 2 bandits.',
      'ann.roundTeamN': 'Round {round}. Best of 3.',
      'ann.roundTeamWon': 'Your team won the round.',
      'ann.roundTeamLost': 'Your team was eliminated.',
      'ann.matchWon': 'Match won {playerWins} to {enemyWins}!',
      'ann.matchLost': 'Match lost {enemyWins} to {playerWins}.',
      'ann.youWonFinal': 'You won. Final score {score}.',
      'ann.roundOverFinal': 'Round over. Final score {score}.',
      'ann.score': 'Score {score}.',
      'ann.health': 'Health {health}. Missiles {missiles}.',
      'ann.planesRemaining1': '1 plane remaining.',
      'ann.planesRemainingN': '{count} planes remaining.',
      'ann.youEliminated': 'You are shot down.',
      'ann.wingmanLost': 'Your wingman is shot down.',
      'ann.youShotDown': 'You shot down {label}.',
      'ann.otherShotDown': '{label} shot down.',
      'ann.youHitOther': 'You hit {label}. {damage} damage. {label} at {health} health.',
      'ann.youGotHit': 'You were hit by {label}. {damage} damage. {health} health left.',
      'ann.youRammed': 'You rammed {label}. {damage} damage to them, {selfDamage} to you.',
      'ann.youGotRammed': '{label} rammed you. {damage} damage.',
      'ann.wallHit': 'Boundary hit. {damage} damage.',
      'ann.missileLock': 'Missile locked on {label}.',
      'ann.missileFired': 'Missile away. {count} left.',
      'ann.missileIncoming': 'Incoming missile.',
      'ann.target': 'Nearest target: {line}.',
      'ann.gunsOverheated': 'Guns overheated.',
      'ann.gunsCooled': 'Guns cooled.',
      'ann.boostEngaged': 'Boost engaged.',
      'ann.boostCooldown': 'Boost on cooldown.',
      'ann.spin': 'You lost control!',
      'ann.recovered': 'You regained control.',
      'ann.survivalRoundStart1': 'Survival! 1 opponent. Survive as long as you can. Go.',
      'ann.survivalRoundStartN': 'Survival! {count} opponents. Survive as long as you can. Go.',
      'ann.survivalEnter': '{label} has entered the sky!',
      'ann.youShotDownSurvival': 'You shot down {label}. {kills} kills.',
      'ann.youEliminatedSurvival': 'You are shot down. {kills} kills.',
      'label.challenger': 'Challenger {n}',

      'label.you': 'You',
      'label.ai': 'Bandit {n}',
      'label.wingman': 'Wingman',
      'label.bandit': 'Bandit {n}',
      'label.car': 'Plane {n}',

      'arena.onTopOfYou': 'right on top of you',
      'arena.bearing.front': 'front',
      'arena.bearing.frontLeft': 'front left',
      'arena.bearing.left': 'left',
      'arena.bearing.behindLeft': 'behind left',
      'arena.bearing.behind': 'behind',
      'arena.bearing.behindRight': 'behind right',
      'arena.bearing.right': 'right',
      'arena.bearing.frontRight': 'front right',
      'arena.range.veryClose': 'very close',
      'arena.range.close': 'close',
      'arena.range.midRange': 'mid range',
      'arena.range.far': 'far',
      'arena.bearingFmt': '{bearing}, {range}',

      'target.sweepLine': '{label}: {bearing}, {motion}, {health} health',
      'target.motion.approaching': 'closing',
      'target.motion.movingAway': 'opening',
      'target.motion.circling': 'crossing',
      'target.noOthers': 'No enemy planes.',
      'target.youEliminated': 'You are shot down.',
      'target.chasing': '{label} is on your tail',
      'target.fleeing': '{label} is breaking away',
      'target.approaching': '{label} is closing',
      'target.leaving': '{label} is opening distance',
      'target.circling': '{label} is crossing',
      'target.idle': '{label} is drifting',
      'target.changedDirection': '{label} changed vector',
      'target.shortFront': 'ahead',
      'target.shortLeft': 'left',
      'target.shortBehind': 'behind',
      'target.shortRight': 'right',
      'target.commentaryFmt': '{phrase}, {bearing}, {health} health.',
    },
  }

  let current = FALLBACK
  const listeners = []

  function detect() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && dictionaries[stored]) return stored
    } catch (e) {}
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
