// KOMBAT combat rules — the four buttons, and what beats what.
//
// The four attack keys are a 2x2 grid on the right hand, and the grid IS the
// mechanic:
//
//            punch     kick
//   high      U         I        <- top row: blockable, whiffs a low profile
//   low       J         K        <- bottom row: goes UNDER a block, jumpable
//
// Left column is punches: short, fast, cheap. Right column is kicks: long,
// slow, heavy, and a whiffed one is a free hit for the other fighter.
//
// The defensive triangle, which is the entire game:
//
//   * A HIGH attack is stopped by BLOCK (hold S). Jumping it does nothing —
//     you rise straight into it, and get hit harder for being airborne.
//   * A LOW attack goes under a block completely. The only answer is to JUMP
//     (W) so it passes beneath you — or to not be in range.
//   * Standing still and doing neither loses to both.
//
// So attacking is a guess too: block-happy opponents get swept, jumpy ones get
// caught out of the air by a high kick. Neither key is ever the right answer
// twice in a row, which is what stops the game being a mash.
//
// You can hear which one is coming. Every attack broadcasts a tell during its
// startup frames whose pitch sweeps UP for a high and DOWN for a low, at the
// attacker's position in the stereo field. The startup times below are
// therefore reaction budgets, not animation lengths: a kick's long startup is
// the game being fair about how loud its own warning is.
content.combat = (() => {
  const K = () => content.constants

  // level: which defence answers it. limb: how it sounds and how it spaces.
  const ATTACKS = {
    highPunch: {
      id: 'highPunch', key: 'U', level: 'high', limb: 'punch',
      reach: 1.15, startup: 0.13, active: 0.07, recovery: 0.20,
      damage: 7, pushback: 0.18, knockdown: false,
    },
    highKick: {
      id: 'highKick', key: 'I', level: 'high', limb: 'kick',
      reach: 1.80, startup: 0.25, active: 0.09, recovery: 0.38,
      damage: 13, pushback: 0.75, knockdown: false,
    },
    lowPunch: {
      id: 'lowPunch', key: 'J', level: 'low', limb: 'punch',
      reach: 1.05, startup: 0.15, active: 0.07, recovery: 0.22,
      damage: 6, pushback: 0.14, knockdown: false,
    },
    // The sweep. Longest reach of the four, and the only basic attack that puts
    // someone on the floor — which is why its recovery is the worst in the game.
    lowKick: {
      id: 'lowKick', key: 'K', level: 'low', limb: 'kick',
      reach: 1.70, startup: 0.28, active: 0.10, recovery: 0.42,
      damage: 12, pushback: 0.45, knockdown: true,
    },
  }

  const ORDER = ['highPunch', 'highKick', 'lowPunch', 'lowKick']

  // Resolve one attack that has just gone active against the other fighter.
  // Returns a verdict object; nothing here mutates anything.
  //
  //   outcome: 'hit' | 'block' | 'whiff' | 'jumped'
  //
  // `jumped` is deliberately distinct from `whiff`: a sweep that passed under
  // an airborne opponent was a correct read by THEM, and it sounds different
  // from a swing at empty air, because the player needs to learn which of the
  // two mistakes they just made.
  function resolve(attack, atk, def) {
    const dist = Math.abs(def.x - atk.x)
    const reach = attack.reach * (atk.character.reachMult || 1)

    if (dist > reach) return {outcome: 'whiff', damage: 0}
    if (def.down > 0) return {outcome: 'whiff', damage: 0}   // already on the floor

    const airborne = def.y > K().AIRBORNE_AT

    // A low attack passes underneath anyone off the ground. Nothing else about
    // their state matters — you cannot block your way out of having read it
    // right.
    if (attack.level === 'low' && airborne) {
      return {outcome: 'jumped', damage: 0}
    }

    // A block only exists on the floor, and only covers the high line.
    if (attack.level === 'high' && def.blocking && !airborne) {
      return {
        outcome: 'block',
        damage: rawDamage(attack, atk) * K().CHIP_FRACTION,
        stun: K().BLOCKSTUN,
        pushback: attack.pushback * 1.4,
      }
    }

    // Anything left connects. Catching someone in the air pays a bonus and
    // always drops them, because their jump has to have cost something.
    let damage = rawDamage(attack, atk)
    if (airborne) damage *= K().AIR_HIT_BONUS

    return {
      outcome: 'hit',
      damage,
      airHit: airborne,
      stun: K().HITSTUN,
      pushback: attack.pushback,
      knockdown: attack.knockdown || airborne,
    }
  }

  function rawDamage(attack, atk) {
    return attack.damage * (atk.character.damageMult || 1)
  }

  // Startup and recovery both scale with the fighter, so a heavyweight is
  // genuinely harder to hit a gap with and a lightweight genuinely safer.
  function timing(attack, fighter) {
    const s = fighter.character.speedMult || 1
    return {
      startup: attack.startup / s,
      active: attack.active,
      recovery: attack.recovery / s,
    }
  }

  return {
    ATTACKS,
    ORDER,
    get: (id) => ATTACKS[id],
    resolve,
    timing,
    rawDamage,
  }
})()
