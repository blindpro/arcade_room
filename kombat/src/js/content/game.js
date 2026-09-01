// KOMBAT match state.
//
// One update() per frame drives everything: two fighters, at most one
// projectile, a round clock, and a ladder. Nothing in this file makes a sound
// or touches the DOM — it emits events and the game screen turns those into
// audio and announcements, which is what lets the whole match be simulated
// headless.
//
// Both fighters run through exactly the same code. The only difference between
// you and the opponent is where the intent comes from: yours arrives from the
// keyboard via setInput(), theirs from content.ai. That is deliberate — it is
// the only way to be sure the AI is not cheating, and it means a mirror match
// is genuinely a mirror.
content.game = (() => {
  const K = () => content.constants
  const C = () => content.combat

  const state = {
    phase: 'ready',       // ready | fight | ko | matchover | gameover
    phaseT: 0,
    score: 0,
    wave: 1,              // ladder stage, 1-based (the collection's HUD name)
    stage: 0,             // 0-based
    round: 1,
    roundsWon: {player: 0, foe: 0},
    clock: K().ROUND_TIME,
    playerId: 'sable',
    player: null,
    foe: null,
    projectile: null,
    lastVerdict: null,
  }

  function makeFighter(side, characterId) {
    const character = content.characters.get(characterId)
    return {
      side,
      character,
      x: side === 'player' ? -1.6 : 1.6,
      y: 0,
      jumpT: -1,          // >= 0 while airborne; drives the arc
      jumpVx: 0,          // horizontal velocity locked in at take-off
      facing: side === 'player' ? 1 : -1,
      maxHealth: character.health,
      health: character.health,
      blocking: false,
      action: null,
      stun: 0,
      down: 0,
      cooldown: 0,
      motion: [],
      intent: blankIntent(),
    }
  }

  function blankIntent() {
    return {left: false, right: false, jump: false, block: false, attack: null}
  }

  // ---------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------

  function reset(playerId) {
    state.playerId = playerId || state.playerId
    state.score = 0
    state.stage = 0
    state.wave = 1
    startStage()
  }

  function startStage() {
    state.roundsWon.player = 0
    state.roundsWon.foe = 0
    state.round = 1
    state.wave = state.stage + 1
    const foeId = content.characters.opponentFor(state.playerId, state.stage).id
    state.player = makeFighter('player', state.playerId)
    state.foe = makeFighter('foe', foeId)
    content.ai.reset(state.foe, state.stage)
    startRound()
  }

  function startRound() {
    for (const f of [state.player, state.foe]) {
      f.x = f.side === 'player' ? -1.6 : 1.6
      f.y = 0
      f.jumpT = -1
      f.health = f.maxHealth
      f.blocking = false
      f.action = null
      f.stun = 0
      f.down = 0
      f.cooldown = 0
      f.motion.length = 0
      f.intent = blankIntent()
    }
    state.projectile = null
    state.clock = K().ROUND_TIME
    state.phase = 'ready'
    state.phaseT = 0
    content.events.emit('round-start', {
      round: state.round,
      stage: state.wave,
      player: state.player.character.id,
      foe: state.foe.character.id,
      playerHealth: state.player.maxHealth,
      foeHealth: state.foe.maxHealth,
    })
  }

  // ---------------------------------------------------------------------------
  // input
  // ---------------------------------------------------------------------------

  // The screen hands over held flags plus at most one attack EDGE per frame.
  // Attacks are edges because a fighting game where holding a button repeats is
  // not a fighting game.
  function setInput(intent) {
    if (!state.player) return
    applyIntent(state.player, intent)
  }

  function applyIntent(f, intent) {
    const prev = f.intent
    f.intent = {
      left: !!intent.left,
      right: !!intent.right,
      jump: !!intent.jump,
      block: !!intent.block,
      attack: intent.attack || null,
    }
    // Direction EDGES feed the motion buffer that specials are read out of.
    if (f.intent.left && !prev.left) pushMotion(f, -1)
    if (f.intent.right && !prev.right) pushMotion(f, 1)
    f.intent.jumpEdge = f.intent.jump && !prev.jump
  }

  function pushMotion(f, dirSign) {
    // Stored relative to facing, so a special is the same motion whichever side
    // of the arena you happen to be standing on.
    const dir = dirSign === f.facing ? 'forward' : 'back'
    f.motion.push({dir, t: 0})
    if (f.motion.length > 4) f.motion.shift()
  }

  function motionMatches(f, want) {
    if (f.motion.length < want.length) return false
    const tail = f.motion.slice(-want.length)
    for (let i = 0; i < want.length; i++) {
      if (tail[i].dir !== want[i]) return false
      if (tail[i].t > K().MOTION_WINDOW) return false
    }
    return true
  }

  // ---------------------------------------------------------------------------
  // the frame
  // ---------------------------------------------------------------------------

  function update(delta) {
    state.phaseT += delta

    if (state.phase === 'ready') {
      if (state.phaseT >= K().READY_TIME) {
        state.phase = 'fight'
        state.phaseT = 0
        content.events.emit('fight', {round: state.round})
      }
      return
    }

    if (state.phase === 'ko') {
      updateFighterPhysics(state.player, delta)
      updateFighterPhysics(state.foe, delta)
      if (state.phaseT >= K().KO_TIME) advanceAfterKo()
      return
    }

    if (state.phase !== 'fight') return

    state.clock -= delta
    if (state.clock <= 0) {
      state.clock = 0
      timeOut()
      return
    }

    // The opponent decides first, on the state it can actually perceive.
    applyIntent(state.foe, content.ai.decide(state.foe, state.player, state, delta))

    faceEachOther()
    for (const f of [state.player, state.foe]) {
      tickTimers(f, delta)
      act(f, delta)
      advanceAction(f, delta)
      updateFighterPhysics(f, delta)
    }
    separate()
    updateProjectile(delta)

    content.events.emit('frame', {delta, status: status()})
  }

  function tickTimers(f, delta) {
    if (f.stun > 0) f.stun = Math.max(0, f.stun - delta)
    if (f.down > 0) {
      f.down = Math.max(0, f.down - delta)
      if (f.down === 0) content.events.emit('getup', {side: f.side, x: f.x})
    }
    if (f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - delta)
    for (const m of f.motion) m.t += delta
    while (f.motion.length && f.motion[0].t > K().MOTION_WINDOW * 2) f.motion.shift()
  }

  function canAct(f) {
    return f.stun <= 0 && f.down <= 0 && !f.action
  }

  function act(f, delta) {
    // Block is a state, not an action: it is on for exactly as long as the key
    // is down, and only while you are on the floor and free.
    f.blocking = f.intent.block && f.y <= K().AIRBORNE_AT && f.stun <= 0 &&
      f.down <= 0 && !f.action

    if (!canAct(f)) { f.walking = false; return }

    if (f.intent.attack) {
      const wanted = f.intent.attack
      f.intent.attack = null
      if (!trySpecial(f, wanted)) startAttack(f, wanted)
      return
    }

    if (f.intent.jumpEdge && f.y <= 0.0001) {
      f.intent.jumpEdge = false
      f.jumpT = 0
      f.jumpVx = walkDir(f) * K().WALK_SPEED * (f.character.speedMult || 1) * K().AIR_DRIFT
      content.events.emit('jump', {side: f.side, x: f.x})
      return
    }

    // Walking. Blocking and being airborne both take it away — in the air you
    // keep only the velocity you left the floor with.
    const dir = (f.blocking || f.y > 0.0001) ? 0 : walkDir(f)
    f.walking = dir !== 0
    if (dir) {
      const speed = K().WALK_SPEED * (f.character.speedMult || 1)
      f.x = K().clamp(f.x + dir * speed * delta, -K().ARENA_HALF, K().ARENA_HALF)
    }
  }

  function walkDir(f) {
    return (f.intent.right ? 1 : 0) - (f.intent.left ? 1 : 0)
  }

  function startAttack(f, id) {
    const attack = C().get(id)
    if (!attack) return
    const t = C().timing(attack, f)
    f.action = {
      kind: 'attack', attack, id,
      phase: 'startup', t: 0,
      startup: t.startup, active: t.active, recovery: t.recovery,
      resolved: false,
    }
    content.events.emit('tell', {
      side: f.side, x: f.x, level: attack.level, limb: attack.limb,
      startup: t.startup,
    })
  }

  function trySpecial(f, buttonId) {
    const sp = f.character.special
    if (!sp || sp.button !== buttonId) return false
    if (f.cooldown > 0) return false
    if (!motionMatches(f, sp.motion)) return false

    f.motion.length = 0
    f.cooldown = K().SPECIAL_COOLDOWN
    f.action = {
      kind: 'special', special: sp, id: sp.id,
      phase: 'startup', t: 0,
      startup: sp.charge, active: 0.10, recovery: sp.recovery,
      resolved: false, hitsLeft: sp.hits || 1,
    }
    content.events.emit('special-charge', {
      side: f.side, x: f.x, id: sp.id, level: sp.level, charge: sp.charge,
      fighter: f.character.id,
    })
    return true
  }

  function advanceAction(f, delta) {
    const a = f.action
    if (!a) return
    a.t += delta

    if (a.phase === 'startup') {
      if (a.t < a.startup) return
      a.t -= a.startup
      a.phase = 'active'
      if (a.kind === 'attack') resolveAttack(f, a)
      else fireSpecial(f, a)
    }

    if (a.phase === 'active') {
      if (a.t < a.active) return
      a.t -= a.active
      a.phase = 'recovery'
    }

    if (a.phase === 'recovery' && a.t >= a.recovery) {
      f.action = null
    }
  }

  // ---------------------------------------------------------------------------
  // hits
  // ---------------------------------------------------------------------------

  function resolveAttack(f, a) {
    const other = opponentOf(f)
    const verdict = C().resolve(a.attack, f, other)
    landVerdict(f, other, a.attack.level, a.attack.limb, verdict)
  }

  function landVerdict(f, other, level, limb, verdict) {
    state.lastVerdict = verdict.outcome

    if (verdict.outcome === 'whiff' || verdict.outcome === 'jumped') {
      content.events.emit(verdict.outcome === 'jumped' ? 'jumped-over' : 'whiff', {
        side: f.side, x: f.x, level, limb,
      })
      return
    }

    const dir = other.x >= f.x ? 1 : -1
    other.x = K().clamp(other.x + dir * (verdict.pushback || 0), -K().ARENA_HALF, K().ARENA_HALF)

    const damage = Math.round(verdict.damage * 10) / 10
    other.health = Math.max(0, other.health - damage)
    other.stun = Math.max(other.stun, verdict.stun || 0)
    if (verdict.outcome === 'hit') {
      other.blocking = false
      other.action = null
      if (verdict.knockdown) {
        other.down = K().KNOCKDOWN_TIME
        other.y = 0
        other.jumpT = -1
      }
    }

    if (f.side === 'player') state.score += Math.round(damage * 10)

    content.events.emit(verdict.outcome === 'block' ? 'blocked' : 'hit', {
      side: f.side,                       // who threw it
      victim: other.side,
      x: other.x,
      level, limb,
      damage,
      airHit: !!verdict.airHit,
      knockdown: !!verdict.knockdown,
      health: other.health,
      healthFrac: other.health / other.maxHealth,
    })

    if (other.health <= 0) knockOut(f, other)
  }

  function fireSpecial(f, a) {
    const sp = a.special
    const other = opponentOf(f)

    content.events.emit('special-fire', {
      side: f.side, x: f.x, id: sp.id, level: sp.level, fighter: f.character.id,
    })

    if (sp.projectile) {
      state.projectile = {
        owner: f.side, x: f.x, dir: f.facing, level: sp.level,
        damage: sp.damage * (f.character.damageMult || 1), id: sp.id,
      }
      return
    }

    if (sp.teleport) {
      // Reappear on the far side of the opponent. The stereo image flips, which
      // is the actual weapon.
      const beyond = other.x + (other.x >= f.x ? sp.teleport : -sp.teleport)
      f.x = K().clamp(beyond, -K().ARENA_HALF, K().ARENA_HALF)
      faceEachOther()
      content.events.emit('teleport', {side: f.side, x: f.x})
    }

    if (sp.dashTo != null) {
      const sign = other.x >= f.x ? 1 : -1
      f.x = K().clamp(other.x - sign * sp.dashTo, -K().ARENA_HALF, K().ARENA_HALF)
      content.events.emit('dash', {side: f.side, x: f.x})
    }

    const hits = sp.hits || 1
    for (let i = 0; i < hits; i++) {
      if (other.health <= 0) break
      const verdict = specialVerdict(sp, f, other)
      landVerdict(f, other, sp.level, 'special', verdict)
    }
  }

  // Specials go through their own resolution rather than combat.resolve because
  // they break its rules on purpose: Quake ignores range entirely, and a
  // multi-hit flurry has to re-check between hits.
  function specialVerdict(sp, f, other) {
    const dist = Math.abs(other.x - f.x)
    const range = sp.range == null ? Infinity : sp.range * (f.character.reachMult || 1)
    if (dist > range) return {outcome: 'whiff', damage: 0}
    if (other.down > 0) return {outcome: 'whiff', damage: 0}

    const airborne = other.y > K().AIRBORNE_AT
    if (sp.level === 'low' && airborne) return {outcome: 'jumped', damage: 0}

    if (sp.level === 'high' && other.blocking && !airborne) {
      return {
        outcome: 'block',
        damage: sp.damage * (f.character.damageMult || 1) * K().CHIP_FRACTION,
        stun: K().BLOCKSTUN, pushback: 0.5,
      }
    }

    let damage = sp.damage * (f.character.damageMult || 1)
    if (airborne) damage *= K().AIR_HIT_BONUS
    return {
      outcome: 'hit', damage, airHit: airborne,
      stun: K().HITSTUN, pushback: 0.55,
      knockdown: !!sp.knockdown || airborne,
    }
  }

  function updateProjectile(delta) {
    const p = state.projectile
    if (!p) return
    p.x += p.dir * K().PROJECTILE_SPEED * delta

    const owner = p.owner === 'player' ? state.player : state.foe
    const target = opponentOf(owner)

    if (Math.abs(p.x - target.x) < 0.45) {
      state.projectile = null
      const airborne = target.y > K().AIRBORNE_AT
      const blocked = target.blocking && !airborne
      landVerdict(owner, target, p.level, 'special', blocked
        ? {outcome: 'block', damage: p.damage * K().CHIP_FRACTION, stun: K().BLOCKSTUN, pushback: 0.4}
        : {
          outcome: 'hit',
          damage: p.damage * (airborne ? K().AIR_HIT_BONUS : 1),
          airHit: airborne, stun: K().HITSTUN, pushback: 0.6, knockdown: airborne,
        })
      return
    }

    if (Math.abs(p.x) > K().ARENA_HALF) {
      state.projectile = null
      content.events.emit('projectile-gone', {x: p.x})
      return
    }

    content.events.emit('projectile', {
      x: p.x,
      dist: Math.abs(p.x - state.player.x),
      incoming: p.owner === 'foe',
    })
  }

  // ---------------------------------------------------------------------------
  // physics
  // ---------------------------------------------------------------------------

  function updateFighterPhysics(f, delta) {
    if (f.jumpT >= 0) {
      f.jumpT += delta
      const t = f.jumpT / K().JUMP_TIME
      if (t >= 1) {
        f.jumpT = -1
        f.y = 0
        content.events.emit('land', {side: f.side, x: f.x})
      } else {
        // A plain parabola. Height is not a number the player has to read — it
        // only ever answers "on the floor, or not".
        f.y = 4 * K().JUMP_HEIGHT * t * (1 - t)
        f.x = K().clamp(f.x + f.jumpVx * delta, -K().ARENA_HALF, K().ARENA_HALF)
      }
    }
  }

  function separate() {
    const p = state.player, f = state.foe
    const gap = Math.abs(p.x - f.x)
    const min = K().MIN_SEPARATION
    if (gap >= min) return
    const push = (min - gap) / 2
    const sign = p.x <= f.x ? -1 : 1
    p.x = K().clamp(p.x + sign * push, -K().ARENA_HALF, K().ARENA_HALF)
    f.x = K().clamp(f.x - sign * push, -K().ARENA_HALF, K().ARENA_HALF)
  }

  function faceEachOther() {
    const p = state.player, f = state.foe
    p.facing = f.x >= p.x ? 1 : -1
    f.facing = -p.facing
  }

  // ---------------------------------------------------------------------------
  // rounds and the ladder
  // ---------------------------------------------------------------------------

  function knockOut(winner, loser) {
    state.phase = 'ko'
    state.phaseT = 0
    state.roundsWon[winner.side]++
    const perfect = winner.health >= winner.maxHealth - 0.001
    if (winner.side === 'player') {
      state.score += 500 + (perfect ? 400 : 0)
    }
    content.events.emit('ko', {
      winner: winner.side,
      perfect,
      round: state.round,
      playerRounds: state.roundsWon.player,
      foeRounds: state.roundsWon.foe,
      remainingHealth: Math.round(winner.health),
    })
  }

  function timeOut() {
    const p = state.player, f = state.foe
    const winner = p.health === f.health ? null : (p.health > f.health ? p : f)
    state.phase = 'ko'
    state.phaseT = 0
    if (winner) {
      state.roundsWon[winner.side]++
      if (winner.side === 'player') state.score += 300
    } else {
      // A draw gives the round to nobody and is replayed.
      state.round--
    }
    content.events.emit('timeout', {
      winner: winner ? winner.side : null,
      playerHealth: Math.round(p.health),
      foeHealth: Math.round(f.health),
      playerRounds: state.roundsWon.player,
      foeRounds: state.roundsWon.foe,
    })
  }

  function advanceAfterKo() {
    const need = K().ROUNDS_TO_WIN
    if (state.roundsWon.player >= need) {
      // Stage cleared. Time left on the clock is worth something, so finishing
      // fast is worth more than finishing safe.
      state.score += 1000 + Math.round(state.clock) * 25
      content.events.emit('stage-clear', {
        stage: state.wave, score: state.score,
        beat: state.foe.character.id,
        last: state.stage + 1 >= content.characters.ladderLength(),
      })
      state.stage++
      if (state.stage >= content.characters.ladderLength()) {
        state.phase = 'gameover'
        content.events.emit('game-over', {score: state.score, stage: state.wave, won: true})
        return
      }
      startStage()
      return
    }
    if (state.roundsWon.foe >= need) {
      state.phase = 'gameover'
      content.events.emit('game-over', {score: state.score, stage: state.wave, won: false})
      return
    }
    state.round++
    startRound()
  }

  // ---------------------------------------------------------------------------
  // readouts
  // ---------------------------------------------------------------------------
  //
  // Every event that has a place carries `x`: the ABSOLUTE arena position of
  // whatever made the sound — the attacker for a tell, the victim for an
  // impact, the fighter's own x for a jump or a landing. It is never an offset
  // from the player. Where that ends up in the stereo image is content.audio's
  // business, because that is where the listener lives.

  function opponentOf(f) { return f.side === 'player' ? state.foe : state.player }

  function stanceOf(f) {
    if (f.down > 0) return 'down'
    if (f.y > K().AIRBORNE_AT) return 'air'
    if (f.blocking) return 'block'
    return 'stand'
  }

  function status() {
    const p = state.player, f = state.foe
    if (!p || !f) return {}
    const dist = Math.abs(f.x - p.x)
    return {
      phase: state.phase,
      score: state.score,
      stage: state.wave,
      round: state.round,
      clock: Math.max(0, Math.ceil(state.clock)),
      playerRounds: state.roundsWon.player,
      foeRounds: state.roundsWon.foe,
      playerId: p.character.id,
      foeId: f.character.id,
      health: Math.ceil(p.health),
      healthFrac: p.health / p.maxHealth,
      foeHealth: Math.ceil(f.health),
      foeHealthFrac: f.health / f.maxHealth,
      dist,
      dx: f.x - p.x,
      playerX: p.x, foeX: f.x,
      playerY: p.y, foeY: f.y,
      arenaHalf: K().ARENA_HALF,
      stance: stanceOf(p),
      foeStance: stanceOf(f),
      // Whether your input would be accepted right now. Hitstun, a knockdown
      // and your own recovery frames all take control away, and there is no
      // other way to tell those apart from "the key did nothing".
      canAct: canAct(p),
      foeCanAct: canAct(f),
      foeTone: f.character.toneHz,
      playerWalking: !!p.walking,
      foeWalking: !!f.walking,
      cooldown: p.cooldown,
      specialReady: p.cooldown <= 0,
      cornered: Math.abs(p.x) > K().ARENA_HALF - 0.4,
      // Spacing, which is most of what the player has to know. There are TWO
      // boundaries, not one: kicks reach from a long way out, punches only from
      // close in, and the gap between the two is where a fight is actually
      // fought. Both edges are published, not just which side of them we are
      // on — the audio gate needs the boundary itself, because a gate with no
      // hysteresis chatters exactly where two fighters stand.
      //
      // The punch edge is the SHORTER of the two punches, so "in punch range"
      // means both of them reach rather than only one; being told you can punch
      // and then whiffing a low one is worse than not being told.
      kickReach: C().ATTACKS.highKick.reach * (p.character.reachMult || 1),
      punchReach: Math.min(C().ATTACKS.highPunch.reach, C().ATTACKS.lowPunch.reach) *
        (p.character.reachMult || 1),
      inKickRange: dist <= C().ATTACKS.highKick.reach * (p.character.reachMult || 1),
      // Measured against the same shorter punch as `punchReach`, so the F2
      // readout and the range gate can never disagree about which band you are
      // in — being told two different things by two parts of the same game is
      // worse than being told one of them.
      inPunchRange: dist <= Math.min(C().ATTACKS.highPunch.reach, C().ATTACKS.lowPunch.reach) *
        (p.character.reachMult || 1),
      foeInKickRange: dist <= C().ATTACKS.highKick.reach * (f.character.reachMult || 1),
      projectile: state.projectile
        ? {dx: state.projectile.x - p.x, incoming: state.projectile.owner === 'foe'}
        : null,
    }
  }

  return {
    state,
    reset,
    setInput,
    update,
    status,
    phase: () => state.phase,
    setPlayer: (id) => { state.playerId = id },
    playerId: () => state.playerId,
  }
})()
