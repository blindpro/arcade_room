// Persistent profile for SURGE. Everything that outlives a single run lives
// here: four currencies, the shop, achievements, daily missions, lifetime
// stats and settings. Saved to localStorage so it survives restarts.
//
// Currencies:
//   coins  — earned every run, spend on everyday unlocks and packs
//   gems   — rarer, from gems/gold pickups, spend on premium unlocks
//   cores  — very rare, from core pickups, spend on legendary items
//   tokens — the daily-mission currency, spend on per-run consumable packs
content.meta = (() => {
  const LS_KEY = 'surge.profile.v1'
  const C = content.constants
  const U = content.util

  // ---- definitions ------------------------------------------------------------------
  function ach(id, nameKey, reward, progressFor) {
    return {id, nameKey, reward, progressFor, isDone: p => progressFor(p).cur >= progressFor(p).target}
  }
  const ACHIEVEMENTS = [
    ach('first-run', 'ach.first.run', {coins: 100}, p => ({cur: p.stats.runs, target: 1})),
    ach('runner', 'ach.runner', {coins: 250}, p => ({cur: p.stats.totalDistance, target: 1000})),
    ach('marathon', 'ach.marathon', {gems: 25}, p => ({cur: p.stats.totalDistance, target: 10000})),
    ach('speedster', 'ach.speedster', {coins: 400}, p => ({cur: Math.round(p.stats.maxSpeed), target: 25})),
    ach('hopper', 'ach.hopper', {coins: 150}, p => ({cur: p.stats.totalJumps, target: 100})),
    ach('marksman', 'ach.marksman', {coins: 300}, p => ({cur: p.stats.totalKills, target: 50})),
    ach('slayer', 'ach.slayer', {gems: 20}, p => ({cur: p.stats.totalKills, target: 250})),
    ach('treasure', 'ach.treasure', {coins: 200}, p => ({cur: p.stats.totalCoins, target: 500})),
    ach('gem-finder', 'ach.gem', {coins: 350}, p => ({cur: p.stats.totalGems, target: 100})),
    ach('core-collector', 'ach.core', {gems: 30}, p => ({cur: p.stats.totalCores, target: 10})),
    ach('emp-artist', 'ach.emp', {coins: 250}, p => ({cur: p.stats.fencesEmpd, target: 5})),
    ach('sewer-rat', 'ach.sewer', {coins: 250}, p => ({cur: p.stats.sewerEntries, target: 5})),
    ach('adventurer', 'ach.adventurer', {gems: 40}, p => ({cur: p.stats.adventureLevels, target: 3})),
    ach('champion', 'ach.champion', {cores: 5}, p => ({cur: p.stats.adventureLevels, target: 5})),
    ach('merchant', 'ach.merchant', {coins: 400}, p => ({cur: p.ownedCount, target: 3})),
    ach('deep-runner', 'ach.deep', {gems: 50}, p => ({cur: p.stats.endlessBest, target: 2000})),
    ach('bounty-hunter', 'ach.bounty', {coins: 350}, p => ({cur: p.stats.totalKills, target: 100})),
    ach('exterminator', 'ach.exterminator', {gems: 30}, p => ({cur: p.stats.totalKills, target: 500})),
    ach('explorer', 'ach.explorer', {gems: 25}, p => ({cur: p.stats.worldsVisited, target: 5})),
    ach('globe-trotter', 'ach.globetrotter', {cores: 5}, p => ({cur: p.stats.worldsVisited, target: 9})),
  ]
  const achById = id => ACHIEVEMENTS.find(a => a.id === id)

  function daily(id, nameKey, reward, progressFor) {
    return {id, nameKey, reward, progressFor}
  }
  const DAILY_POOL = [
    daily('d.run500', 'daily.run500', {tokens: 20}, p => ({cur: p.stats.totalDistance, target: 500})),
    daily('d.run2000', 'daily.run2000', {tokens: 50}, p => ({cur: p.stats.totalDistance, target: 2000})),
    daily('d.coins100', 'daily.coins100', {tokens: 25}, p => ({cur: p.stats.totalCoins, target: 100})),
    daily('d.coins300', 'daily.coins300', {tokens: 60}, p => ({cur: p.stats.totalCoins, target: 300})),
    daily('d.kills10', 'daily.kills10', {tokens: 25}, p => ({cur: p.stats.totalKills, target: 10})),
    daily('d.kills30', 'daily.kills30', {tokens: 60}, p => ({cur: p.stats.totalKills, target: 30})),
    daily('d.jumps50', 'daily.jumps50', {tokens: 25}, p => ({cur: p.stats.totalJumps, target: 50})),
    daily('d.jumps150', 'daily.jumps150', {tokens: 60}, p => ({cur: p.stats.totalJumps, target: 150})),
    daily('d.gems5', 'daily.gems5', {tokens: 30}, p => ({cur: p.stats.totalGems, target: 5})),
    daily('d.level1', 'daily.level1', {tokens: 50}, p => ({cur: p.stats.adventureLevels, target: 1})),
    daily('d.endless800', 'daily.endless800', {tokens: 40}, p => ({cur: p.stats.endlessBest, target: 800})),
  ]
  const dailyById = id => DAILY_POOL.find(d => d.id === id)

  // Shop. kind: unlock = permanent passive/unlock, item = consumable pack.
  const SHOP = {
    rocket:      {nameKey: 'shop.rocket', descKey: 'shop.rocket.desc', price: {gems: 200}, kind: 'unlock', unlock: 'rocket', icon: 'rocket'},
    medkit_pack: {nameKey: 'shop.medkit', descKey: 'shop.medkit.desc', price: {coins: 250}, kind: 'item', item: 'medkit', count: 1, icon: 'medkit'},
    emp_pack:    {nameKey: 'shop.emp', descKey: 'shop.emp.desc', price: {coins: 300}, kind: 'item', item: 'emp', count: 1, icon: 'emp'},
    shield_start:{nameKey: 'shop.shieldStart', descKey: 'shop.shieldStart.desc', price: {coins: 600}, kind: 'unlock', passive: 'shield_start', icon: 'shield'},
    magnet:      {nameKey: 'shop.magnet', descKey: 'shop.magnet.desc', price: {coins: 900}, kind: 'unlock', passive: 'magnet', icon: 'magnet'},
    double_coins:{nameKey: 'shop.doubleCoins', descKey: 'shop.doubleCoins.desc', price: {coins: 1200}, kind: 'unlock', passive: 'double_coins', icon: 'coin'},
    extra_hp:    {nameKey: 'shop.extraHp', descKey: 'shop.extraHp.desc', price: {coins: 1500}, kind: 'unlock', passive: 'extra_hp', icon: 'heart'},
    speed_shoes: {nameKey: 'shop.speedShoes', descKey: 'shop.speedShoes.desc', price: {coins: 1200}, kind: 'unlock', passive: 'speed_shoes', icon: 'boost'},
    lifeline:    {nameKey: 'shop.lifeline', descKey: 'shop.lifeline.desc', price: {gems: 800}, kind: 'unlock', passive: 'lifeline', icon: 'lifeline'},
    surge_core:  {nameKey: 'shop.surgeCore', descKey: 'shop.surgeCore.desc', price: {cores: 300}, kind: 'unlock', passive: 'surge_core', icon: 'core'},
    t_medkit:    {nameKey: 'shop.tMedkit', descKey: 'shop.tMedkit.desc', price: {tokens: 40}, kind: 'item', item: 'medkit', count: 1, icon: 'medkit'},
    t_emp:       {nameKey: 'shop.tEmp', descKey: 'shop.tEmp.desc', price: {tokens: 60}, kind: 'item', item: 'emp', count: 1, icon: 'emp'},
    t_shield:    {nameKey: 'shop.tShield', descKey: 'shop.tShield.desc', price: {tokens: 80}, kind: 'item', item: 'shield', count: 1, icon: 'shield'},
    t_boost:     {nameKey: 'shop.tBoost', descKey: 'shop.tBoost.desc', price: {tokens: 60}, kind: 'item', item: 'boost', count: 1, icon: 'boost'},
    overdrive_pack: {nameKey: 'shop.overdrive', descKey: 'shop.overdrive.desc', price: {coins: 500}, kind: 'item', item: 'overdrive', count: 1, icon: 'overdrive'},
    brake_pack:     {nameKey: 'shop.brake', descKey: 'shop.brake.desc', price: {coins: 450}, kind: 'item', item: 'brake', count: 1, icon: 'brake'},
    t_overdrive:    {nameKey: 'shop.tOverdrive', descKey: 'shop.tOverdrive.desc', price: {tokens: 70}, kind: 'item', item: 'overdrive', count: 1, icon: 'overdrive'},
    t_brake:        {nameKey: 'shop.tBrake', descKey: 'shop.tBrake.desc', price: {tokens: 65}, kind: 'item', item: 'brake', count: 1, icon: 'brake'},
  }

  // ---- default profile -------------------------------------------------------------
  function defaultProfile() {
    return {
      name: 'Runner',
      coins: 0, gems: 0, cores: 0, tokens: 0,
      owned: {},
      achievements: {},
      dailies: {date: null, missions: [], done: [], claimed: []},
      stats: {
        runs: 0, totalDistance: 0, totalCoins: 0, totalGems: 0, totalCores: 0,
        totalKills: 0, totalJumps: 0, maxSpeed: 0, empsUsed: 0, fencesEmpd: 0,
        sewerEntries: 0, adventureLevels: 0, endlessBest: 0, worldsVisited: 0,
      },
      best: {
        adventure: {score: 0, level: 0},
        endless: {score: 0, dist: 0},
        sprint: {score: 0, dist: 0},
      },
      settings: {music: 0.8, fx: 0.9, voice: 1.0},
    }
  }

  // ---- storage ----------------------------------------------------------------------
  let profile = null
  function load() {
    if (profile) return profile
    profile = defaultProfile()
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        profile = Object.assign(defaultProfile(), saved)
        profile.stats = Object.assign(defaultProfile().stats, saved.stats)
        profile.best = Object.assign(defaultProfile().best, saved.best)
        profile.settings = Object.assign(defaultProfile().settings, saved.settings)
        profile.dailies = Object.assign(defaultProfile().dailies, saved.dailies || {})
      }
    } catch (e) { profile = defaultProfile() }
    rollDailies()
    save()
    return profile
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(profile)) } catch (e) {}
  }
  function reset() { profile = defaultProfile(); rollDailies(); save() }

  // ---- dailies ----------------------------------------------------------------------
  function rollDailies() {
    const d = profile.dailies
    if (d.date === U.today() && d.missions.length) return
    const pool = DAILY_POOL.slice()
    const picks = []
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id)
    }
    d.date = U.today()
    d.missions = picks
    d.done = []
    d.claimed = []
    save()
  }
  function dailies() {
    rollDailies()
    return profile.dailies.missions.map(id => {
      const def = dailyById(id)
      const pr = def.progressFor(profile)
      const done = pr.cur >= pr.target
      const claimed = profile.dailies.claimed.includes(id)
      return {id, nameKey: def.nameKey, reward: def.reward, cur: pr.cur, target: pr.target, done, claimed, progress: U.clamp(pr.cur / pr.target, 0, 1)}
    })
  }
  function claimDaily(id) {
    const list = dailies().find(d => d.id === id)
    if (!list || !list.done || list.claimed) return null
    profile.dailies.claimed.push(id)
    grant(list.reward)
    save()
    return list.reward
  }

  // ---- achievements ------------------------------------------------------------------
  function achievements() {
    return ACHIEVEMENTS.map(a => {
      const pr = a.progressFor(profile)
      const unlocked = a.isDone(profile)
      const recorded = profile.achievements[a.id]
      return {id: a.id, nameKey: a.nameKey, reward: a.reward, cur: pr.cur, target: pr.target, unlocked, progress: U.clamp(pr.cur / pr.target, 0, 1), claimed: !!(recorded && recorded.claimed)}
    })
  }
  function checkAchievements() {
    const fresh = []
    ACHIEVEMENTS.forEach(a => {
      if (a.isDone(profile) && !profile.achievements[a.id]) {
        profile.achievements[a.id] = {unlockedAt: U.now(), claimed: false}
        fresh.push(a)
      }
    })
    if (fresh.length) { save(); return fresh.map(a => a.id) }
    return []
  }
  function claimAchievement(id) {
    const rec = profile.achievements[id]
    if (!rec || rec.claimed) return null
    const def = achById(id)
    if (!def) return null
    rec.claimed = true
    grant(def.reward)
    save()
    return def.reward
  }

  // ---- currency helpers ----------------------------------------------------------------
  function balances() { return {coins: profile.coins, gems: profile.gems, cores: profile.cores, tokens: profile.tokens} }
  function grant(amounts) {
    Object.keys(amounts || {}).forEach(k => {
      if (k in profile) profile[k] += amounts[k]
    })
    save()
  }
  function canAfford(price) {
    return Object.keys(price).every(k => profile[k] >= price[k])
  }
  function spend(price) {
    if (!canAfford(price)) return false
    Object.keys(price).forEach(k => profile[k] -= price[k])
    save()
    return true
  }

  // ---- shop ----------------------------------------------------------------------------
  function shopItems() {
    return Object.keys(SHOP).map(id => {
      const def = SHOP[id]
      const owned = def.kind === 'unlock' ? !!(profile.owned[def.unlock || def.passive]) : false
      return {id, nameKey: def.nameKey, descKey: def.descKey, price: def.price, kind: def.kind, icon: def.icon, owned}
    })
  }
  function buyShop(id) {
    const def = SHOP[id]
    if (!def) return 'missing'
    if (def.kind === 'unlock' && profile.owned[def.unlock || def.passive]) return 'owned'
    if (def.kind === 'item' && U.clamp(stashCount(def.item) + def.count, 0, C.ITEM_CAP) === C.ITEM_CAP && stashCount(def.item) >= C.ITEM_CAP) return 'full'
    if (!spend(def.price)) return 'funds'
    if (def.kind === 'unlock') profile.owned[def.unlock || def.passive] = true
    else stashAdd(def.item, def.count)
    save()
    return 'ok'
  }
  function owned(passive) { return !!profile.owned[passive] }

  // ---- in-run inventory (stash) -----------------------------------------------------
  // Consumables bought/earned outside a run sit in the stash and are loaded
  // into a run when it starts.
  function stash() {
    if (!profile.stash) profile.stash = {}
    return profile.stash
  }
  function stashCount(item) { return stash()[item] || 0 }
  function stashAdd(item, n) { stash()[item] = U.clamp((stash()[item] || 0) + n, 0, C.ITEM_CAP); save() }
  function stashSpend(item, n) {
    const s = stash()
    if ((s[item] || 0) < n) return false
    s[item] -= n
    if (!s[item]) delete s[item]
    save()
    return true
  }
  function startInventory() {
    const inv = {}
    C.ITEM_IDS.forEach(id => { inv[id] = C.ITEM_START[id] || 0 })
    Object.keys(stash()).forEach(k => inv[k] = U.clamp(inv[k] + stash()[k], 0, C.ITEM_CAP))
    if (owned('shield_start')) inv.shield = U.clamp(inv.shield + 1, 0, C.ITEM_CAP)
    return inv
  }

  // ---- run modifiers -------------------------------------------------------------------
  function passives() { return profile.owned }
  function maxHp() { return C.HP_MAX + (owned('extra_hp') ? 20 : 0) }
  function speedMult() { return owned('speed_shoes') ? 1.1 : 1 }
  function startWeapon() { return owned('rocket') ? 'pistol' : 'pistol' }

  // ---- run commit ------------------------------------------------------------------------
  // Called at run end with the run results. Adds currencies, updates stats,
  // bests and progress, then re-checks achievements and dailies.
  function commit(res) {
    res = res || {}
    const s = profile.stats
    s.runs += 1
    s.totalDistance += res.distance || 0
    s.totalCoins += res.coins || 0
    s.totalGems += res.gems || 0
    s.totalCores += res.cores || 0
    s.totalKills += res.kills || 0
    s.totalJumps += res.jumps || 0
    s.maxSpeed = Math.max(s.maxSpeed, res.maxSpeed || 0)
    s.empsUsed += res.empsUsed || 0
    s.fencesEmpd += res.fencesEmpd || 0
    s.sewerEntries += res.sewerEntries || 0
    s.adventureLevels = Math.max(s.adventureLevels, res.adventureLevels || 0)
    s.endlessBest = Math.max(s.endlessBest, res.distance || 0)
    s.worldsVisited = Math.max(s.worldsVisited, res.worldsVisited || 0)

    const b = profile.best[res.mode] || profile.best.endless
    if (res.mode && b) {
      if ((res.score || 0) > b.score) b.score = res.score
      if ((res.distance || 0) > (b.dist || 0)) b.dist = res.distance
      if (res.mode === 'adventure' && (res.adventureLevels || 0) > (b.level || 0)) b.level = res.adventureLevels
    }

    grant({coins: res.coins || 0, gems: res.gems || 0, cores: res.cores || 0})
    const newAch = checkAchievements()
    const newDaily = dailies().filter(d => d.done && !profile.dailies.done.includes(d.id)).map(d => d.id)
    profile.dailies.done = profile.dailies.done.concat(newDaily)
    save()
    return {achievements: newAch, dailies: newDaily, balances: balances()}
  }

  // ---- settings -------------------------------------------------------------------------
  function settings() { return profile.settings }
  function setSettings(s) { Object.assign(profile.settings, s); save() }

  return {
    load, save, reset,
    currencies: balances, grant, canAfford, spend,
    achievements, claimAchievement,
    dailies, claimDaily,
    shopItems, buyShop, owned, stashCount, stashAdd, stashSpend,
    startInventory, passives, maxHp, speedMult, startWeapon,
    commit,
    settings, setSettings,
  }
})()
