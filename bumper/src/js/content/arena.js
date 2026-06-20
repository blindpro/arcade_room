/**
 * Arena geometry. Provides multiple map presets of different sizes.
 * One is selected (at random, or by name) at the start of each round.
 * All code that reads arena dimensions goes through `content.arena.bounds`
 * and `content.arena.config`, which reflect the currently active map.
 */
content.arena = (() => {
  // ---- Map presets ----------------------------------------------------
  const MAPS = {
    standard: {width: 100, height: 70,  label: 'Standard'},
    compact:  {width: 60,  height: 40,  label: 'Compact'},
    large:    {width: 140, height: 90,  label: 'Large'},
    wide:     {width: 120, height: 50,  label: 'Wide'},
    tall:     {width: 80,  height: 100, label: 'Tall'},
    square:   {width: 90,  height: 90,  label: 'Square'},
  }

  const MAP_NAMES = Object.keys(MAPS)

  // Current active map. Initialised to standard; game calls selectMap
  // before each round.
  let currentName = 'standard'
  let currentConfig = MAPS.standard
  let currentBounds = {
    minX: -currentConfig.width / 2,
    maxX: currentConfig.width / 2,
    minY: -currentConfig.height / 2,
    maxY: currentConfig.height / 2,
  }

  function updateBounds() {
    currentBounds.minX = -currentConfig.width / 2
    currentBounds.maxX = currentConfig.width / 2
    currentBounds.minY = -currentConfig.height / 2
    currentBounds.maxY = currentConfig.height / 2
  }

  /**
   * Pick a map by name, or random if none given.
   * Returns the map name that was selected.
   */
  function selectMap(name) {
    if (name && MAPS[name]) {
      currentName = name
    } else {
      const keys = MAP_NAMES
      currentName = keys[Math.floor(Math.random() * keys.length)]
    }
    currentConfig = MAPS[currentName]
    updateBounds()
    return currentName
  }

  function getMapName() {
    return currentConfig.label
  }

  function getMapNames() {
    return MAP_NAMES.slice()
  }

  function spawnPoints(count) {
    const {width, height} = currentConfig
    const points = []
    // Inset scales with the smaller dimension so spawn points always
    // have a proportional buffer from walls.
    const inset = Math.max(5, Math.min(width, height) * 0.12)
    const rx = (width / 2) - inset
    const ry = (height / 2) - inset

    for (let i = 0; i < count; i++) {
      const t = (i / count) * engine.const.tau
      const x = Math.cos(t) * rx
      const y = Math.sin(t) * ry
      const heading = Math.atan2(-y, -x) + (Math.random() - 0.5) * 0.1
      points.push({x, y, heading})
    }

    return points
  }

  function bearingDescription(dx, dy) {
    const dist = Math.hypot(dx, dy)
    const t = (k, p) => (app.i18n ? app.i18n.t(k, p) : k)
    if (dist < 0.001) return t('arena.onTopOfYou')

    const angle = Math.atan2(dy, dx)
    const deg = angle * 180 / Math.PI

    let bearingKey
    if (deg > -22.5 && deg <= 22.5) bearingKey = 'arena.bearing.front'
    else if (deg > 22.5 && deg <= 67.5) bearingKey = 'arena.bearing.frontLeft'
    else if (deg > 67.5 && deg <= 112.5) bearingKey = 'arena.bearing.left'
    else if (deg > 112.5 && deg <= 157.5) bearingKey = 'arena.bearing.behindLeft'
    else if (deg > 157.5 || deg <= -157.5) bearingKey = 'arena.bearing.behind'
    else if (deg > -157.5 && deg <= -112.5) bearingKey = 'arena.bearing.behindRight'
    else if (deg > -112.5 && deg <= -67.5) bearingKey = 'arena.bearing.right'
    else bearingKey = 'arena.bearing.frontRight'

    const rangeKey = dist < 4 ? 'arena.range.veryClose'
      : dist < 12 ? 'arena.range.close'
      : dist < 25 ? 'arena.range.midRange'
      : 'arena.range.far'
    return t('arena.bearingFmt', {bearing: t(bearingKey), range: t(rangeKey)})
  }

  return {
    get config() { return currentConfig },
    get bounds() { return currentBounds },
    MAPS,
    MAP_NAMES,
    selectMap,
    getMapName,
    getMapNames,
    spawnPoints,
    bearingDescription,
  }
})()
