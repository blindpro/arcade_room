content.constants = (() => {
  return {
    // --- Player ---
    startingLives: 3,
    startingEnergy: 100,
    maxEnergy: 100,

    // --- Aim ---
    edgeThreshold: 0.95,
    edgeReannounceThrottle: 1.2,

    // --- Energy system ---
    energyRegenLockout: 0.4,
    energyRegenRate: 13,
    lowEnergyOn: 30,
    lowEnergyOff: 50,
    criticalResetThreshold: 80,
    shieldCost: 25,
    shieldThreshold: 25,
    breachEnergy: 50,

    // --- Game timings ---
    preGameLull: 2.0,
    interWaveLull: 3.0,
    gameOverDelay: 1.2,
    stingLeadIn: 0.7,
    minDt: 1 / 60,
    maxDt: 0.25,

    // --- Enemy kinematics ---
    approachTime: {
      scout: 12.0,
      bomber: 17.0,
      battleship: 24.0,
      civilian: 16.0,
    },
    driftSpeed: {
      scout: 0.45,
      bomber: 0.18,
      battleship: 0.10,
      civilian: 0.22,
    },
    pulseRate: {
      scout: {far: 1.4, near: 6.5},
      bomber: {far: 0.9, near: 4.5},
      battleship: {far: 0.6, near: 3.5},
      civilian: {far: 1.0, near: 4.0},
    },
    hp: {
      scout: 1.0,
      bomber: 1.0,
      battleship: 1.4,
      civilian: 1.0,
    },
    baseScore: {
      scout: 100,
      bomber: 250,
      battleship: 500,
    },

    // --- Enemy spawn ---
    spawnXMin: 0.30,
    spawnXRange: 0.55,
    driftJitterMin: 0.7,
    driftJitterRange: 0.6,

    // --- Enemy hit detection ---
    hitRadiusZFactor: 1.2,

    // --- Weapons ---
    energyCost: {pulse: 5, beam: 10, missile: 15},
    hitRadius: {pulse: 0.18, beam: 0.10, missile: 0.30},
    bounceHintInterval: 1.5,

    // --- Wave composition ---
    baseContactsBase: 6,
    baseContactsPerWave: 2,
    maxContacts: 24,
    spawnIntervalBase: 1.4,
    spawnIntervalPerWave: 0.06,
    spawnIntervalMin: 0.75,
    friendFracBase: 0.10,
    friendFracPerWave: 0.015,
    friendFracMax: 0.20,
    friendFracWaveMin: 4,
    classWeightScout: 1.0,
    classWeightBomber: 0.9,
    classWeightBattleship: 0.6,
    chainCountFromWave: 5,
    chainCount: 5,
    spawnJitterMin: 0.85,
    spawnJitterRange: 0.30,

    // --- Scoring ---
    farRangeZ: 0.7,
    pointBlankZ: 0.2,
    farRangeMul: 1.5,
    pointBlankMul: 0.75,
    weaponRightMul: 1.5,
    weaponWrongMul: 0.5,
    chainMax: 5,
    civilianPenalty: 500,
    waveClearBase: 1000,
    perfectChainBase: 2000,
    firstExtendAt: 20000,
    extendStep: 40000,
  }
})()
