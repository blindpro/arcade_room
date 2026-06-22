// Player-fired missiles in flight. Each battery fires to a fixed zone
// center altitude (no crosshair). The whistle is owned by audio.js; this
// module integrates position and triggers a blast at destination.
content.outgoing = (() => {
  const K = () => content.constants

  const ZONE_TARGETS = {
    L: {x: -0.65, y: K().DETONATION_Y},
    C: {x:  0.00, y: K().DETONATION_Y},
    R: {x:  0.65, y: K().DETONATION_Y},
  }

  const list = []

  function spawn(shot) {
    list.push(shot)
    return shot
  }

  function tick(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.elapsed += dt
      if (s.elapsed >= s.duration) {
        content.blasts.spawn({x: s.endX, y: s.endY})
        list.splice(i, 1)
      }
    }
  }

  function clear() { list.length = 0 }
  function count() { return list.length }
  function getAll() { return list }
  function getZoneTarget(batteryId) { return ZONE_TARGETS[batteryId] || ZONE_TARGETS.C }

  return {spawn, tick, clear, count, getAll, getZoneTarget}
})()
