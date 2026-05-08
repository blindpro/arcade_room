// Cardinal-direction next-step probe. Each frame the player is moving,
// look at the immediately adjacent cell in N/E/S/W. A direction is "open"
// if that single cell is walkable; "wall" if it's solid (pillar, perimeter,
// or out-of-bounds). The result is announced (politely) only when it
// CHANGES from the last announced snapshot, with a small min-interval so a
// brisk walk through a corridor doesn't spam the announcer. Driven from
// `game.tick` after the player has updated; reset on room transition so a
// new room re-baselines.
content.exitProbe = (() => {
  const R = () => content.room
  const P = () => content.player

  const DIRS = [
    {key: 'N', dx:  0, dy: -1, i18n: 'ann.dir.north'},
    {key: 'E', dx:  1, dy:  0, i18n: 'ann.dir.east'},
    {key: 'S', dx:  0, dy:  1, i18n: 'ann.dir.south'},
    {key: 'W', dx: -1, dy:  0, i18n: 'ann.dir.west'},
  ]

  const MIN_INTERVAL = 0.45 // seconds between identical-or-different announcements

  let lastSnap = ''
  let lastAnnounceAt = 0

  function probe(px, py) {
    const room = R()
    if (!room) return null
    const cx = Math.floor(px), cy = Math.floor(py)
    const result = {}
    for (const d of DIRS) {
      result[d.key] = room.isWall(cx + d.dx, cy + d.dy) ? 'wall' : 'open'
    }
    return result
  }

  function snapKey(s) {
    return s.N + s.E + s.S + s.W
  }

  function frame() {
    const player = P()
    if (!player || !player.isAlive) return
    if (!player.isAlive()) return
    if (player.getMode() !== 'moving') return
    const p = player.getPosition()
    const s = probe(p.x, p.y)
    if (!s) return
    const sk = snapKey(s)
    if (sk === lastSnap) return
    const now = engine.time()
    if (now - lastAnnounceAt < MIN_INTERVAL) return
    lastSnap = sk
    lastAnnounceAt = now

    const opens = []
    for (const d of DIRS) {
      if (s[d.key] === 'open') opens.push(app.i18n.t(d.i18n))
    }
    if (!opens.length) return
    const msg = opens.length === DIRS.length
      ? app.i18n.t('ann.exits.allOpen')
      : app.i18n.t('ann.exits.open', {open: opens.join(', ')})
    app.announce.polite(msg)
  }

  function reset() {
    lastSnap = ''
    lastAnnounceAt = 0
  }

  return {frame, probe, reset}
})()
