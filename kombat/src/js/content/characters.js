// KOMBAT roster.
//
// Four fighters. They all have the same four buttons — the 2x2 of high/low
// against punch/kick never changes, because it is the language the game is
// played in. What changes is the SHAPE those four buttons take in your hands:
// how far they reach, how long you are committed to them, and how much a clean
// read is worth.
//
// And each fighter has exactly one special, on a Mortal-Kombat-style motion
// input — a direction sequence, then an attack button, inside
// constants.MOTION_WINDOW. One each, not a movelist: the special is meant to be
// the answer to a specific problem the fighter has, not a rotation.
//
// Every fighter also gets its own voice. `voice` tunes the formant bank the
// grunts and pain cries are built from, and `toneHz` is the pitch of the
// presence drone you track them by — so in a mirror match you can still tell
// which of the two tones is you, and across the ladder each opponent announces
// itself before it has done anything.
content.characters = (() => {
  const ROSTER = [
    {
      id: 'rook',
      // The wall. Slowest fighter in the game and the one with the longest
      // basic reach: Rook's problem is that anything quick can walk in and out
      // of a whiffed kick, and Rook's answer is that you cannot afford to be
      // on the floor when the Quake lands.
      health: 125,
      speedMult: 0.78,      // scales walk speed AND attack startup/recovery
      reachMult: 1.16,
      damageMult: 1.24,
      toneHz: 82,
      voice: {basePitch: 96, formant: [420, 900, 2100], grit: 0.55},
      special: {
        id: 'quake',
        // Back, back, then K. A low shockwave with NO range limit — it travels
        // the whole floor. There is no blocking it and no walking out of it;
        // the only answer in the game is to be in the air when it arrives, and
        // its long charge is the game telling you to jump.
        motion: ['back', 'back'], button: 'lowKick',
        level: 'low', charge: 0.52, recovery: 0.70,
        damage: 17, range: Infinity, knockdown: true,
      },
    },
    {
      id: 'vex',
      // The blade. Fastest startup and recovery, shortest reach, least damage
      // per hit — Vex wins by taking four turns while everyone else takes one,
      // and loses to a single clean high kick.
      health: 86,
      speedMult: 1.34,
      reachMult: 0.86,
      damageMult: 0.80,
      toneHz: 158,
      voice: {basePitch: 210, formant: [700, 1500, 2900], grit: 0.22},
      special: {
        id: 'rush',
        // Forward, forward, then J. Closes the gap outright and lands a
        // three-hit flurry on the high line. It is a blockable special on
        // purpose: it is how Vex gets IN, not how Vex wins.
        motion: ['forward', 'forward'], button: 'lowPunch',
        level: 'high', charge: 0.20, recovery: 0.34,
        damage: 5, hits: 3, dashTo: 0.75, range: 1.0,
      },
    },
    {
      id: 'sable',
      // The zoner. Baseline in every stat, and the only fighter who can do
      // anything at all from the far wall. Sable's game is to make you walk
      // into range while a bolt is in the air.
      health: 100,
      speedMult: 1.0,
      reachMult: 1.0,
      damageMult: 1.0,
      toneHz: 124,
      voice: {basePitch: 165, formant: [560, 1250, 2600], grit: 0.30},
      special: {
        id: 'bolt',
        // Back, forward, then U. A projectile on the high line, so it can be
        // blocked but not jumped — jumping a bolt puts you in the air with a
        // bolt arriving, which is worse than standing still. You hear it come:
        // its tone rises as it closes.
        motion: ['back', 'forward'], button: 'highPunch',
        level: 'high', charge: 0.34, recovery: 0.46,
        damage: 14, projectile: true,
      },
    },
    {
      id: 'kroll',
      // The trickster. Slightly quick, slightly fragile, and the only fighter
      // who can change which side of you they are standing on — which in a
      // game read entirely through stereo is a genuine attack on your ability
      // to hear.
      health: 94,
      speedMult: 1.14,
      reachMult: 1.04,
      damageMult: 0.94,
      toneHz: 196,
      voice: {basePitch: 188, formant: [640, 1400, 3100], grit: 0.38},
      special: {
        id: 'shadow',
        // Back, forward, then I. Vanishes, reappears on the FAR side of the
        // opponent, and kicks high. Both the disappearance and the arrival are
        // audible, in that order, with a gap between them — the gap is your
        // chance to work out where they went.
        motion: ['back', 'forward'], button: 'highKick',
        level: 'high', charge: 0.40, recovery: 0.52,
        damage: 18, teleport: 0.85, range: 1.1, knockdown: true,
      },
    },
  ]

  const byId = {}
  for (const c of ROSTER) byId[c.id] = c

  return {
    ROSTER,
    ids: () => ROSTER.map((c) => c.id),
    get: (id) => byId[id] || ROSTER[0],

    // The arcade ladder. Round-robin through everyone who is not you, then the
    // mirror match last — fighting your own tone, on your own stats, is a
    // better final than a stat check.
    opponentFor: function (playerId, stage) {
      const others = ROSTER.filter((c) => c.id !== playerId)
      if (stage >= others.length) return byId[playerId]
      return others[stage % others.length]
    },
    ladderLength: () => ROSTER.length,
  }
})()
