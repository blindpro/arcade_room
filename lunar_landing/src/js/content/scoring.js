// Score accumulator, rank-tier tracking, and per-landing quality tiers.
//
// Each soft landing is classified perfect / clean / sloppy from the vy
// margin and the fuel efficiency vs. the body's suicide-burn optimum.
// Counts are tallied for the run and reported at game-over.
//
// Score per soft landing:
//   1000 * worldN
//    900 * vyMargin            (1 = stopped dead, 0 = at crash speed)
//   1500 * fuelRemaining/fuelMax
//     25 * max(0, 60 - missionElapsedSec)
//
// Crash → 0 for that world; the run ends but cumulative score from
// earlier worlds is kept.
content.scoring = (() => {
  const C = () => content.constants

  const state = {
    score: 0,
    rankIndex: 0,
    lastMissionScore: 0,
    lastTier: null,           // 'perfect' | 'clean' | 'sloppy' | null
    tierCounts: {perfect: 0, clean: 0, sloppy: 0},
  }

  function reset() {
    state.score = 0
    state.rankIndex = 0
    state.lastMissionScore = 0
    state.lastTier = null
    state.tierCounts = {perfect: 0, clean: 0, sloppy: 0}
  }

  function _rankIndexFor(score) {
    let idx = 0
    const tiers = C().RANK_THRESHOLDS
    for (let i = 0; i < tiers.length; i++) {
      if (score >= tiers[i].score) idx = i
    }
    return idx
  }

  function rankKey() {
    return C().RANK_THRESHOLDS[state.rankIndex].key
  }

  // Given the body config and a soft landing's metrics, score the run on
  // two independent axes (gentle? efficient?) and return both the tier
  // string and the underlying quality 0..1 (handy for tests).
  function classify(cfg, vy, fuelRemaining) {
    const fuelMax = cfg.fuel
    const optimalFuel = cfg.optimalBurnTime * C().FUEL_BURN
    const used = fuelMax - fuelRemaining
    const vyEff = Math.max(0, 1 - Math.abs(vy) / cfg.crashSpeed)
    // (fuelMax - used) / (fuelMax - optimalFuel): 1 at optimum, 0 at empty.
    const fuelDenom = Math.max(1, fuelMax - optimalFuel)
    const fuelEff = Math.max(0, Math.min(1, (fuelMax - used) / fuelDenom))
    const quality = 0.5 * vyEff + 0.5 * fuelEff
    let tier = 'sloppy'
    if (quality >= C().TIER_PERFECT) tier = 'perfect'
    else if (quality >= C().TIER_CLEAN) tier = 'clean'
    return {tier, quality, vyEff, fuelEff}
  }

  function awardLanding(missionN, verdict, fuelRemaining, fuelMax, missionElapsedSec) {
    if (!verdict || verdict.key !== 'verdict.soft') {
      state.lastMissionScore = 0
      state.lastTier = null
      return 0
    }
    const cfg = C().bodyConfig(missionN)
    const vyMargin = Math.max(0, 1 - Math.abs(verdict.vy) / cfg.crashSpeed)
    const fuelRatio = Math.max(0, fuelRemaining / Math.max(1, fuelMax))
    const speedBonus = 25 * Math.max(0, 60 - missionElapsedSec)
    const total =
        1000 * missionN
      +  900 * vyMargin
      + 1500 * fuelRatio
      + speedBonus
    const award = Math.round(total)
    state.score += award
    state.lastMissionScore = award

    const cls = classify(cfg, verdict.vy, fuelRemaining)
    state.lastTier = cls.tier
    state.tierCounts[cls.tier]++

    const newIdx = _rankIndexFor(state.score)
    if (newIdx > state.rankIndex) {
      state.rankIndex = newIdx
      content.announcer.rankPromotion(rankKey())
    }
    return award
  }

  function qualifies() {
    return app.highscores.qualifies(state.score)
  }

  return {
    state,
    reset,
    rankKey,
    classify,
    awardLanding,
    qualifies,
  }
})()
