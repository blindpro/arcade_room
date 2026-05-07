// Mission queue. Each game starts at mission 1 and advances on a clean
// soft landing. Missions don't end on crash — the run ends, the player
// keeps the score so far. Past mission 7 the table plateaus.
content.missions = (() => {
  let _missionNum = 1

  function reset() {
    _missionNum = 1
  }

  function current() { return _missionNum }
  function advance() { _missionNum++ }

  return {
    reset,
    current,
    advance,
  }
})()
