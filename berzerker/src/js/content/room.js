// Procedural Berzerk-style room: rectangular grid of cells, four cardinal
// exit gaps (each two tiles wide), and a scatter of axis-aligned wall
// segments inside. Touching ANY wall is fatal — walls are the central
// hazard. The generator must guarantee that all four exit gaps are
// reachable from the spawn tile (run a flood-fill check; regenerate if any
// exit is isolated).
//
// Coordinate system: tile (col, row) with (0, 0) at the top-left. Screen
// "north" = -y, "south" = +y, "east" = +x, "west" = -x. Continuous world
// coords use the same orientation; entities sit on the cell grid but move
// continuously through it.
content.room = (() => {
  const COLS = 40
  const ROWS = 28

  // Mulberry32 — small reproducible PRNG. Seeding from `(depth ^ baseSeed)`
  // makes a given depth's room shape stable across runs while still varying
  // by run (different baseSeed each new game). Reproducibility is helpful
  // for diagnostic playthroughs.
  function mulberry32(seed) {
    let s = seed >>> 0
    return function () {
      s = (s + 0x6D2B79F5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const DIRS = [
    {key: 'N', dx: 0, dy: -1},
    {key: 'E', dx: 1, dy: 0},
    {key: 'S', dx: 0, dy: 1},
    {key: 'W', dx: -1, dy: 0},
  ]

  // Module state — the active room.
  let cells = null
  let exits = null
  let wallSegments = null
  let depth = 1
  let cols = COLS
  let rows = ROWS
  let lastSeed = 0

  function inBounds(x, y) {
    return x >= 0 && x < cols && y >= 0 && y < rows
  }

  function isWall(x, y) {
    if (!inBounds(x, y)) return true
    return cells[y][x] === 1
  }

  function isOpenCell(x, y) {
    return inBounds(x, y) && cells[y][x] === 0
  }

  // Convert the cell grid into AABB segments (one per contiguous wall run)
  // for fast collision and LOS queries. Horizontal runs first (rows),
  // then vertical (cols). Diagonal walls are not used.
  function rebuildSegments() {
    const segs = []
    // Horizontal runs
    for (let y = 0; y < rows; y++) {
      let x = 0
      while (x < cols) {
        if (cells[y][x] !== 1) { x++; continue }
        const x0 = x
        while (x < cols && cells[y][x] === 1) x++
        const x1 = x - 1
        if (x1 > x0) segs.push({x0, y0: y, x1, y1: y, horiz: true})
      }
    }
    // Vertical runs (length ≥ 2 only — single cells already covered above)
    for (let x = 0; x < cols; x++) {
      let y = 0
      while (y < rows) {
        if (cells[y][x] !== 1) { y++; continue }
        const y0 = y
        while (y < rows && cells[y][x] === 1) y++
        const y1 = y - 1
        if (y1 > y0) segs.push({x0: x, y0, x1: x, y1, horiz: false})
        // single cells only get the horizontal-run entry above
      }
    }
    // Always include single-cell pillars not captured by either pass.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (cells[y][x] !== 1) continue
        const lh = (x > 0 && cells[y][x - 1] === 1) || (x + 1 < cols && cells[y][x + 1] === 1)
        const lv = (y > 0 && cells[y - 1][x] === 1) || (y + 1 < rows && cells[y + 1][x] === 1)
        if (!lh && !lv) segs.push({x0: x, y0: y, x1: x, y1: y, horiz: true})
      }
    }
    wallSegments = segs
  }

  // Bresenham-style line check: returns true if the line p0→p1 (continuous
  // world coords) crosses any wall cell. Used by robot LOS and projectile
  // travel checks. We sample at sub-tile resolution along the line.
  function lineHitsWall(p0, p1) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y
    const len = Math.max(Math.abs(dx), Math.abs(dy))
    if (len === 0) return isWall(Math.floor(p0.x), Math.floor(p0.y))
    const steps = Math.ceil(len * 4) // 4 samples per tile
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = Math.floor(p0.x + dx * t)
      const y = Math.floor(p0.y + dy * t)
      if (isWall(x, y)) return true
    }
    return false
  }

  // Returns the wall cell coords any circle of radius r at (x,y) overlaps,
  // or null if none. Walls are 1×1 tile AABBs; we test the four corners
  // around the circle and any cell that's a wall counts.
  function wallsTouchedBy(x, y, r) {
    const minX = Math.floor(x - r), maxX = Math.floor(x + r)
    const minY = Math.floor(y - r), maxY = Math.floor(y + r)
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (!isWall(cx, cy)) continue
        // closest point on the cell AABB to (x, y)
        const px = Math.max(cx, Math.min(x, cx + 1))
        const py = Math.max(cy, Math.min(y, cy + 1))
        const ddx = x - px, ddy = y - py
        if (ddx * ddx + ddy * ddy <= r * r) return {x: cx, y: cy}
      }
    }
    return null
  }

  // Closest point on a wall segment (treating the segment as a series of
  // unit AABBs) to the given world position. Returns {x, y, dist} or null
  // if the segment is empty. Used by `wallVoice.js` to position continuous
  // proximity-buzz voices on the nearest active walls.
  function nearestPointOnSegment(seg, x, y) {
    const sx0 = seg.x0, sy0 = seg.y0
    const sx1 = seg.x1 + 1, sy1 = seg.y1 + 1 // open interval upper bound = AABB outer corner
    const px = Math.max(sx0, Math.min(x, sx1))
    const py = Math.max(sy0, Math.min(y, sy1))
    const dx = x - px, dy = y - py
    return {x: px, y: py, dist: Math.sqrt(dx * dx + dy * dy)}
  }

  function nearestWallSegments(x, y, n) {
    if (!wallSegments) return []
    const ranked = wallSegments
      .map((seg) => ({seg, p: nearestPointOnSegment(seg, x, y)}))
      .sort((a, b) => a.p.dist - b.p.dist)
    return ranked.slice(0, n)
  }

  // BFS flood fill over open cells from `from`. Returns a Set keyed
  // by `y*cols + x` of every reachable cell index.
  function floodFillReachable(from) {
    const seen = new Set()
    if (!isOpenCell(from.x, from.y)) return seen
    const queue = [from]
    seen.add(from.y * cols + from.x)
    while (queue.length) {
      const c = queue.shift()
      for (const d of DIRS) {
        const nx = c.x + d.dx, ny = c.y + d.dy
        const idx = ny * cols + nx
        if (seen.has(idx)) continue
        if (!isOpenCell(nx, ny)) continue
        seen.add(idx)
        queue.push({x: nx, y: ny})
      }
    }
    return seen
  }

  // Pick a 3-tile-wide gap centered at the given coordinate along an edge.
  // Edge is one of N/E/S/W. Jitter ±1 from center for variety. Width 3
  // (was 2) gives the player a forgiving alignment window — with player
  // radius 0.34 the safe corridor is ~2.32 tiles wide, well over a step,
  // so "approximately lined up" actually walks through cleanly.
  function placeExitGap(rand, dir) {
    if (dir === 'N' || dir === 'S') {
      const y = (dir === 'N') ? 0 : rows - 1
      const cx = Math.floor(cols / 2) + (Math.floor(rand() * 3) - 1)
      const a = Math.max(2, Math.min(cols - 5, cx))
      return [{x: a, y}, {x: a + 1, y}, {x: a + 2, y}]
    }
    const x = (dir === 'W') ? 0 : cols - 1
    const cy = Math.floor(rows / 2) + (Math.floor(rand() * 3) - 1)
    const a = Math.max(2, Math.min(rows - 5, cy))
    return [{x, y: a}, {x, y: a + 1}, {x, y: a + 2}]
  }

  // Build outer wall, punch four cardinal exit gaps, scatter pillars,
  // validate reachability, retry if necessary.
  function generate(seed, depthArg) {
    const rand = mulberry32(seed)
    cols = COLS
    rows = ROWS
    depth = depthArg
    lastSeed = seed

    const baseRetries = 24

    for (let retry = 0; retry < baseRetries; retry++) {
      // Reset cells (1 = wall, 0 = open).
      cells = []
      for (let y = 0; y < rows; y++) {
        const row = new Array(cols)
        for (let x = 0; x < cols; x++) {
          row[x] = (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) ? 1 : 0
        }
        cells.push(row)
      }

      // Punch exits.
      exits = {}
      for (const dir of ['N', 'E', 'S', 'W']) {
        const gap = placeExitGap(rand, dir)
        exits[dir] = gap
        for (const c of gap) cells[c.y][c.x] = 0
      }

      // Reserve spawn area (3×3) around center.
      const spawn = {x: Math.floor(cols / 2), y: Math.floor(rows / 2)}
      const reserved = new Set()
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          reserved.add((spawn.y + dy) * cols + (spawn.x + dx))
        }
      }
      // Reserve corridors leading away from each exit so generated pillars
      // don't immediately wall the player off.
      for (const dir of ['N', 'E', 'S', 'W']) {
        for (const c of exits[dir]) {
          for (let i = 0; i < 4; i++) {
            const ix = c.x + (dir === 'E' ? -i : dir === 'W' ? i : 0)
            const iy = c.y + (dir === 'S' ? -i : dir === 'N' ? i : 0)
            reserved.add(iy * cols + ix)
          }
        }
      }

      // Place 4 + floor(depth/2) pillars (1–6 long, 1 thick).
      const pillarCount = 4 + Math.floor((depth - 1) / 2)
      let placed = 0
      let attempts = 0
      while (placed < pillarCount && attempts < pillarCount * 12) {
        attempts++
        const horiz = rand() < 0.5
        const len = 1 + Math.floor(rand() * 6) // 1..6
        const x = 1 + Math.floor(rand() * (cols - 2 - (horiz ? len : 0)))
        const y = 1 + Math.floor(rand() * (rows - 2 - (horiz ? 0 : len)))
        let ok = true
        for (let i = 0; i < len; i++) {
          const cx = x + (horiz ? i : 0)
          const cy = y + (horiz ? 0 : i)
          if (reserved.has(cy * cols + cx)) { ok = false; break }
        }
        if (!ok) continue
        for (let i = 0; i < len; i++) {
          const cx = x + (horiz ? i : 0)
          const cy = y + (horiz ? 0 : i)
          cells[cy][cx] = 1
        }
        placed++
      }

      // Validate: every exit gap reachable from spawn?
      const reachable = floodFillReachable(spawn)
      let allReachable = true
      for (const dir of ['N', 'E', 'S', 'W']) {
        for (const c of exits[dir]) {
          if (!reachable.has(c.y * cols + c.x)) { allReachable = false; break }
        }
        if (!allReachable) break
      }
      if (allReachable) break
      // else loop and regenerate
    }

    rebuildSegments()
    return {cells, exits, wallSegments, cols, rows, spawn: {x: Math.floor(cols / 2), y: Math.floor(rows / 2)}}
  }

  // Centroid of an exit gap (3 tiles wide). Used for placing the exit
  // chord voice and for F4 distance announcements.
  function exitCenter(dir) {
    const gap = exits[dir]
    const last = gap[gap.length - 1]
    const x = (gap[0].x + last.x) / 2 + 0.5
    const y = (gap[0].y + last.y) / 2 + 0.5
    return {x, y}
  }

  // Returns the exit dir if the player's tile is one of the gap cells
  // along the perimeter, else null. Triggering on "stepped into a gap
  // cell" (rather than "reached the very outer edge") means the player
  // transitions the moment they cross into the open doorway, not after
  // an extra fractional-tile shuffle into the wall plane. Without this
  // you could stand fully inside the gap cell and F4 would say "0 steps
  // east, lined up" yet exitAt would still return null because x was
  // < cols-0.4.
  function exitAt(x, y) {
    if (!exits) return null
    const cx = Math.floor(x), cy = Math.floor(y)
    for (const dir of ['N', 'E', 'S', 'W']) {
      const gap = exits[dir]
      if (!gap) continue
      for (const c of gap) {
        if (c.x === cx && c.y === cy) return dir
      }
    }
    return null
  }

  // A position just inside the room from a given exit, used to spawn the
  // player after entering through that exit's mirror image.
  function spawnFromExit(dir) {
    const c = exitCenter(dir)
    if (dir === 'N') return {x: c.x, y: 1.6}
    if (dir === 'S') return {x: c.x, y: rows - 1.6}
    if (dir === 'W') return {x: 1.6, y: c.y}
    if (dir === 'E') return {x: cols - 1.6, y: c.y}
    return {x: cols / 2, y: rows / 2}
  }

  return {
    generate,
    cellAt: (x, y) => (inBounds(x, y) ? cells[y][x] : 1),
    isWall,
    isOpenCell,
    lineHitsWall,
    wallsTouchedBy,
    nearestWallSegments,
    floodFillReachable,
    exitCenter,
    exitAt,
    spawnFromExit,
    cells: () => cells,
    exits: () => exits,
    wallSegments: () => wallSegments || [],
    cols: () => cols,
    rows: () => rows,
    depth: () => depth,
    seed: () => lastSeed,
    spawn: () => ({x: Math.floor(cols / 2), y: Math.floor(rows / 2)}),
  }
})()
