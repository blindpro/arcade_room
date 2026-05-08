/**
 * ESCALADOR — high score persistence.
 *
 * Dual backend: Electron writes a JSON file via the preload bridge; the
 * web build falls back to localStorage. Up to 10 entries.
 *
 * Stored fields: name, score, floor reached, building, timestamp. Never
 * rendered strings — locale switches keep the table coherent.
 */
app.highscores = (() => {
  const KEY = 'escalador-highscores-v1'
  const MAX = 10

  let cache = null

  function readFromStorage() {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return []
      const data = JSON.parse(raw)
      return Array.isArray(data) ? data : []
    } catch (e) { return [] }
  }
  function writeToStorage(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)) } catch (e) {}
  }
  function readFromFile() {
    if (!app.isElectron() || !window.ElectronApi || !window.ElectronApi.readHighScores) return null
    try { return window.ElectronApi.readHighScores() } catch (e) { return null }
  }
  function writeToFile(list) {
    if (!app.isElectron() || !window.ElectronApi || !window.ElectronApi.writeHighScores) return
    try { window.ElectronApi.writeHighScores(list) } catch (e) {}
  }

  function load() {
    if (cache) return cache
    let list = readFromFile()
    if (!list) list = readFromStorage()
    cache = (list || [])
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX)
    return cache
  }
  function save(list) {
    cache = list.slice().sort((a, b) => b.score - a.score).slice(0, MAX)
    writeToStorage(cache)
    writeToFile(cache)
  }

  return {
    list: () => load().slice(),
    qualifies: (score) => {
      const list = load()
      if (list.length < MAX) return true
      return score > list[list.length - 1].score
    },
    add: function (name, score, floor, building) {
      const list = load()
      list.push({
        name: String(name || 'Player').slice(0, 16),
        score: score | 0,
        floor: floor | 0,
        building: building | 0,
        date: new Date().toISOString(),
      })
      save(list)
      return cache
    },
    clear: function () {
      cache = []
      writeToStorage([])
      writeToFile([])
    },
  }
})()
