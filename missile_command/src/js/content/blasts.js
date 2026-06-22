// Blast clouds: short-lived expanding-then-contracting damage zones.
// On spawn, queue an audible bloom and start a damage timer that scans
// content.threats for hits while the radius is open.
content.blasts = (() => {
  const K = () => content.constants

  const list = []
  let nextId = 1

  const _TOTAL = () => K().BLAST_EXPAND_TIME + K().BLAST_HOLD_TIME + K().BLAST_CONTRACT_TIME

  function radiusFor(elapsed) {
    if (elapsed < K().BLAST_EXPAND_TIME) return K().BLAST_MAX_RADIUS * (elapsed / K().BLAST_EXPAND_TIME)
    if (elapsed < K().BLAST_EXPAND_TIME + K().BLAST_HOLD_TIME) return K().BLAST_MAX_RADIUS
    if (elapsed < _TOTAL()) {
      const k = (elapsed - K().BLAST_EXPAND_TIME - K().BLAST_HOLD_TIME) / K().BLAST_CONTRACT_TIME
      return K().BLAST_MAX_RADIUS * (1 - k)
    }
    return 0
  }

  function spawn({x, y}) {
    const b = {
      id: nextId++,
      x, y,
      elapsed: 0,
      total: _TOTAL(),
      // Track threats already killed by this blast so a single threat
      // doesn't get scored twice while the radius is held open.
      killedIds: new Set(),
    }
    list.push(b)
    content.audio.emitBlast(x, y, _TOTAL())
    content.events.emit('blast-spawn', {x, y})
    return b
  }

  function tick(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]
      b.elapsed += dt
      const r = radiusFor(b.elapsed)
      if (r > 0) {
        const hits = content.threats.within(b.x, b.y, r)
        for (const t of hits) {
          if (b.killedIds.has(t.id)) continue
          b.killedIds.add(t.id)
          content.threats.killById(t.id, true)
        }
      }
      if (b.elapsed >= b.total) list.splice(i, 1)
    }
  }

  function clear() { list.length = 0 }
  function count() { return list.length }
  function getAll() { return list }

  return {spawn, tick, clear, count, getAll}
})()
