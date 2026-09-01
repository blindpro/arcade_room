// KOMBAT opponent.
//
// The AI produces the same intent object the keyboard does and gets no extra
// information — it reads x, y, blocking and the opponent's current action, all
// of which are things the player can hear. It cannot see the future, and it
// does not get told what attack is coming any earlier than the tell announces
// it out loud.
//
// The one thing that makes it beatable is REACTION TIME. When you start an
// attack, the AI does not react instantly; it registers the tell and answers
// `reaction` seconds later. Since a punch's startup is shorter than the
// reaction of every difficulty below the last one, a punch is a genuine "too
// fast to respond to" — and a kick, whose long startup exists precisely so the
// warning is fair, is genuinely reactable. That is the same deal the player
// gets, from the other side.
//
// It also keeps a running count of how you defend, and skews its own offence
// against it. Block everything and you will get swept; jump everything and it
// will start throwing high kicks to catch you coming down. The counter decays,
// so changing your habits actually changes its behaviour within a round.
content.ai = (() => {
  const K = () => content.constants
  const C = () => content.combat

  // Difficulty by ladder stage. Reaction is the whole curve: 0.42s cannot
  // punish a punch and barely answers a kick; 0.20s answers everything the
  // player can throw, which is why it is the last rung.
  const TIERS = [
    {reaction: 0.42, accuracy: 0.62, aggression: 0.45, specialOdds: 0.10},
    {reaction: 0.34, accuracy: 0.72, aggression: 0.58, specialOdds: 0.18},
    {reaction: 0.27, accuracy: 0.82, aggression: 0.70, specialOdds: 0.26},
    {reaction: 0.20, accuracy: 0.90, aggression: 0.82, specialOdds: 0.34},
  ]

  let brain = null

  function reset(foe, stage) {
    const tier = TIERS[Math.min(stage, TIERS.length - 1)]
    brain = {
      ...tier,
      // Where it chooses to stand. There are two such places, and it moves
      // between them, because there are two ranges in the game:
      //
      //   KICK  just inside a kick. Its own kicks reach, and so do yours.
      //   PUNCH close enough that all four buttons work, for either of us.
      //
      // A single resting distance was not enough. Held at kick range the
      // opponent is never inside a punch, so U and J simply never land: half
      // the buttons on the pad are decoration for the whole match. Closing to
      // punch range and backing out again is also what makes a round have a
      // shape — the fight breathes in and out instead of orbiting one radius.
      //
      // (It used to rest at kick reach PLUS a quarter unit — "just outside my
      // own longest attack". Both fighters have roughly the same reach, so that
      // read as "just outside YOURS": it parked a hand's width beyond the
      // player's longest attack and every swing thrown from where it chose to
      // stand was a whiff by construction. Its safety is meant to come from
      // reacting to the tell, which is a fight; being untouchable is not.)
      reachMult: foe.character.reachMult || 1,
      stance: 'kick',
      stanceT: 1.2,
      backoff: 0,           // seconds of retreat left in the current one
      backoffCool: 0,       // and how long until it may retreat again
      nextAction: 0.4,
      pending: null,        // a tell we have registered but not yet answered
      seenAction: null,
      defence: 0,           // <0 = they block, >0 = they jump
      motionStep: 0,        // walking out a special's direction sequence
      motionT: 0,
      wantSpecial: false,
    }
  }

  function decide(foe, player, state, delta) {
    if (!brain) reset(foe, 0)

    const intent = {left: false, right: false, jump: false, block: false, attack: null}
    const dist = Math.abs(player.x - foe.x)
    const toward = player.x >= foe.x ? 1 : -1

    brain.nextAction -= delta
    brain.backoff -= delta
    brain.backoffCool -= delta
    if (brain.pending) brain.pending.t -= delta

    // Change its mind about which range it wants to be at. Weighted toward
    // kick range, which is where its own best attacks live, but it spends real
    // time up close — and a player who hears it come in has a window in which
    // their punches are the fastest thing on the floor.
    brain.stanceT -= delta
    if (brain.stanceT <= 0) {
      brain.stance = Math.random() < 0.38 ? 'punch' : 'kick'
      brain.stanceT = brain.stance === 'punch'
        ? 1.1 + Math.random() * 1.2
        : 1.6 + Math.random() * 1.8
    }
    const preferred = preferredDistance()

    observe(foe, player)

    // --- defence: answer a tell we registered `reaction` seconds ago ---------
    const answer = takeAnswer(foe, player)
    if (answer === 'block') {
      intent.block = true
      return intent
    }
    if (answer === 'jump') {
      intent.jump = true
      return intent
    }

    // Nothing to answer and we are mid-move: keep still.
    if (foe.action || foe.stun > 0 || foe.down > 0) return intent

    // --- the special's motion input -----------------------------------------
    // The AI walks out the same direction sequence the player has to, which is
    // why you can hear it coming: those are real steps in the stereo field.
    if (brain.wantSpecial) {
      const done = stepMotion(foe, intent, toward, delta)
      if (done) {
        intent.attack = foe.character.special.button
        brain.wantSpecial = false
        brain.nextAction = 0.7 + Math.random() * 0.5
      }
      return intent
    }

    // --- offence -------------------------------------------------------------
    if (brain.nextAction <= 0) {
      const choice = chooseAttack(foe, player, dist)
      if (choice === 'special') {
        brain.wantSpecial = true
        brain.motionStep = 0
        brain.motionT = 0
        return intent
      }
      if (choice) {
        intent.attack = choice
        brain.nextAction = (0.45 + Math.random() * 0.7) * (1.4 - brain.aggression)
        return intent
      }
      brain.nextAction = 0.12
    }

    // --- spacing --------------------------------------------------------------
    // Hold the preferred distance, with a dead band so it does not shuffle.
    //
    // Backing off is a MOVE, with a length and a cooldown, not a per-frame coin
    // flip. As a coin flip it was a permanent half-speed retreat: the player
    // held forward, the opponent gave ground for as long as they kept holding
    // it, and the gap never closed enough to matter. Now it gives ground for a
    // beat and then has to stand and deal with you.
    if (dist > preferred + 0.2) {
      if (toward > 0) intent.right = true; else intent.left = true
    } else if (brain.backoff > 0) {
      if (toward > 0) intent.left = true; else intent.right = true
    } else if (dist < preferred - 0.45 && brain.backoffCool <= 0) {
      brain.backoff = 0.28
      brain.backoffCool = 1.6
      if (toward > 0) intent.left = true; else intent.right = true
    } else if (player.action && Math.random() < brain.accuracy * 0.5) {
      // They are committed to something and we are outside its reach: block
      // rather than stand there, because the cost of a wrong guess is low here.
      intent.block = true
    }

    return intent
  }

  // The distance it is currently trying to hold. Both are measured INSIDE the
  // attack they are named for, so arriving there means the attack already
  // reaches rather than nearly reaches — and the punch stance uses the SHORTER
  // punch, so getting there makes both of them live.
  function preferredDistance() {
    if (brain.stance === 'punch') {
      return Math.min(C().ATTACKS.highPunch.reach, C().ATTACKS.lowPunch.reach) *
        brain.reachMult - 0.15
    }
    return C().ATTACKS.highKick.reach * brain.reachMult - 0.25
  }

  // Register the player's attack the first time we see it in startup, and only
  // become able to answer it `reaction` seconds later.
  function observe(foe, player) {
    const a = player.action
    if (!a) {
      brain.seenAction = null
      return
    }
    if (brain.seenAction === a) return
    brain.seenAction = a
    const level = a.kind === 'special' ? a.special.level : a.attack.level
    brain.pending = {level, t: brain.reaction, action: a}
  }

  function takeAnswer(foe, player) {
    const p = brain.pending
    if (!p || p.t > 0) return null
    brain.pending = null

    // The attack already finished — too fast for us. This is where a punch
    // beats a slow tier, and it is not cheating in either direction.
    if (player.action !== p.action) return null
    if (foe.stun > 0 || foe.down > 0 || foe.action) return null

    // A read can be wrong. When it is, we do the OTHER thing, which is what
    // makes a lower tier punishable rather than merely slow.
    const correct = Math.random() < brain.accuracy
    const wantBlock = correct ? p.level === 'high' : p.level === 'low'

    if (wantBlock) return 'block'
    // Only jump if there is time to actually leave the floor.
    return foe.y <= 0.0001 ? 'jump' : 'block'
  }

  function chooseAttack(foe, player, dist) {
    const reachMult = foe.character.reachMult || 1
    const sp = foe.character.special
    const specialInRange = sp.range == null || sp.projectile ||
      dist <= (sp.range || Infinity) * reachMult + (sp.dashTo != null ? 4 : 0)

    if (foe.cooldown <= 0 && specialInRange && Math.random() < brain.specialOdds) {
      return 'special'
    }

    // Which basic attacks can actually connect from here.
    const options = C().ORDER.filter((id) => dist <= C().ATTACKS[id].reach * reachMult)
    if (!options.length) return null
    if (Math.random() > brain.aggression) return null

    // Catch them in the air: a high attack is the only thing that hits an
    // airborne fighter, and it hits harder for it.
    if (player.y > K().AIRBORNE_AT) {
      if (options.includes('highKick')) return 'highKick'
      if (options.includes('highPunch')) return 'highPunch'
      return null
    }

    // Punish a block with a sweep: it goes straight under.
    if (player.blocking && options.includes('lowKick')) return 'lowKick'

    // Otherwise mix, weighted against whatever they have been doing. `defence`
    // drifts negative when they block and positive when they jump.
    const wantLow = brain.defence < 0
      ? 0.5 + Math.min(0.35, -brain.defence * 0.12)
      : 0.5 - Math.min(0.35, brain.defence * 0.12)

    const pool = options.filter((id) =>
      (C().ATTACKS[id].level === 'low') === (Math.random() < wantLow))
    const from = pool.length ? pool : options
    return from[Math.floor(Math.random() * from.length)]
  }

  // Walk the special's direction sequence out on the floor, one step per
  // MOTION_WINDOW/2, so the input is legitimate and audible.
  function stepMotion(foe, intent, toward, delta) {
    const sp = foe.character.special
    brain.motionT += delta
    const step = sp.motion[brain.motionStep]
    if (!step) return true

    const sign = step === 'forward' ? toward : -toward
    if (sign > 0) intent.right = true; else intent.left = true

    if (brain.motionT >= K().MOTION_WINDOW * 0.45) {
      brain.motionT = 0
      brain.motionStep++
      // Release the key for one frame so the next press is a fresh edge.
      intent.left = false
      intent.right = false
    }
    return brain.motionStep >= sp.motion.length
  }

  // Called by the game screen when the player defends, so the mixup has
  // something to learn from.
  function noteDefence(kind) {
    if (!brain) return
    brain.defence = K().clamp(
      brain.defence * 0.94 + (kind === 'jump' ? 1 : -1), -6, 6)
  }

  return {
    reset,
    decide,
    noteDefence,
    tier: () => brain && {reaction: brain.reaction, accuracy: brain.accuracy},
  }
})()
