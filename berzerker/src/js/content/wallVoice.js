// Continuous proximity-buzz voices for electrified walls. We don't spawn
// one voice per wall segment (a roomful would be CPU-expensive and fight
// with the binaural mix); instead we maintain two small pools that each
// frame retarget the nearest segments of their type.
//
// Two timbres on purpose:
//   PERIMETER (the room's outer boundary) — deep mains-electricity hum
//     plus broadband noise around 950 Hz. Reads as a "big steady wall."
//   PILLAR (interior wall stubs) — brighter coil/fluorescent-flicker tone:
//     higher noise band (~1500 Hz), 220 Hz square hum, slow amplitude
//     flicker. Reads as a "small electrified obstacle."
//
// The two timbres are obviously different by ear, so the player can tell
// "I'm next to the room edge" from "there's a pillar near me" without
// having to analyse direction or distance.
content.wallVoice = (() => {
  const A = () => content.audio
  const R = () => content.room

  const POOL_SIZE_PERIMETER = 4
  const POOL_SIZE_PILLAR    = 3

  // Perimeter falloff — wide reach so you can hear the room edge from a
  // ways away. Quartic so close walls dominate.
  const PERIMETER_PROX_NEAR = 0.4
  const PERIMETER_PROX_FAR  = 9
  const PERIMETER_PROX_POW  = 4
  const PERIMETER_PEAK_CAP  = 0.4

  // Pillar falloff — tighter range. A pillar is a small, local hazard;
  // it shouldn't bleed across the room or mask the perimeter cue. Cubic
  // so the on/off transition feels crisper than the perimeter.
  const PILLAR_PROX_NEAR = 0.4
  const PILLAR_PROX_FAR  = 5.5
  const PILLAR_PROX_POW  = 3
  const PILLAR_PEAK_CAP  = 0.35

  let voicesPerimeter = []
  let voicesPillar    = []
  let busGain = 0.7
  function setBusGain(g) { busGain = g }

  // ----- perimeter timbre ---------------------------------------------------
  // NOTE: we deliberately DO NOT wire `mod.detune` to oscillators / noise
  // here. The wall voice pool slot-swaps targets each frame (slot 0
  // tracks "currently nearest perimeter," not a specific wall), so the
  // makeProp behind-detune CS — smoothed via setTargetAtTime over ~50ms —
  // would audibly glissando between the old and new target's behindness
  // every retarget. That came across as random pitch wobble during
  // movement. The behind cue still works for persistent voices (chord
  // beacons, robot rolling/projectile voices). Walls keep just the
  // muffle, which is gentler and less perceptually disruptive on swaps.
  function buildPerimeterVoice(out, _mod) {
    const ctx = engine.context()
    // Broadband noise → bandpass-ish around 950 Hz.
    const n = ctx.createBufferSource()
    n.buffer = engine.buffer.whiteNoise({channels: 1, duration: 4.0})
    n.loop = true

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 950
    lp.Q.value = 0.7

    // Deep 60 Hz mains saw — sub-bass anchor that says "big wall."
    const hum = ctx.createOscillator()
    hum.type = 'sawtooth'
    hum.frequency.value = 60
    const humGain = ctx.createGain()
    humGain.gain.value = 0.06
    hum.connect(humGain).connect(out)

    n.connect(hp).connect(lp).connect(out)
    n.start()
    hum.start()
    return () => {
      try { n.stop() } catch (_) {}
      try { hum.stop() } catch (_) {}
    }
  }

  // ----- pillar timbre ------------------------------------------------------
  // Smaller, brighter "coil whine" with a fluorescent-flicker amplitude
  // modulation so the pillar reads as a discrete electrical device, not
  // a wall. Frequency content sits well above the perimeter so the two
  // can play simultaneously without masking each other. Same no-detune
  // policy as the perimeter (see buildPerimeterVoice for why).
  function buildPillarVoice(out, _mod) {
    const ctx = engine.context()

    // Bright noise band centred ~1500 Hz.
    const n = ctx.createBufferSource()
    n.buffer = engine.buffer.whiteNoise({channels: 1, duration: 4.0})
    n.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 600
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1500
    bp.Q.value = 4

    // 220 Hz square — coil/transformer pitch, contrasts with the
    // perimeter's 60 Hz saw.
    const hum = ctx.createOscillator()
    hum.type = 'square'
    hum.frequency.value = 220
    const humGain = ctx.createGain()
    humGain.gain.value = 0.045
    hum.connect(humGain).connect(out)

    // Fluorescent-flicker amplitude modulation: 8–14 Hz random per voice
    // so multiple pillars don't pulse in lockstep. Depth ±35%.
    const flicker = ctx.createOscillator()
    flicker.type = 'sine'
    flicker.frequency.value = 8 + Math.random() * 6
    const flickerGain = ctx.createGain()
    flickerGain.gain.value = 0.35
    const ampMod = ctx.createGain()
    ampMod.gain.value = 1.0
    flicker.connect(flickerGain).connect(ampMod.gain)

    n.connect(hp).connect(bp).connect(ampMod).connect(out)
    n.start()
    hum.start()
    flicker.start()
    return () => {
      try { n.stop() } catch (_) {}
      try { hum.stop() } catch (_) {}
      try { flicker.stop() } catch (_) {}
    }
  }

  function ensurePools() {
    // Keys are required so audio.frame() ticks each voice's _update(),
    // which is what runs the binaural-position update, behind-listener
    // muffle, and behind-listener detune. Without keys the voices play
    // from their creation position with no per-frame muffle/pitch drop —
    // the "wall behind me sounds the same as wall ahead" bug.
    if (voicesPerimeter.length !== POOL_SIZE_PERIMETER) {
      for (const v of voicesPerimeter) { try { v.destroy() } catch (_) {} }
      voicesPerimeter = []
      for (let i = 0; i < POOL_SIZE_PERIMETER; i++) {
        voicesPerimeter.push(A().makeProp({
          build: buildPerimeterVoice,
          x: 0, y: 0, gain: 0, normalize: true,
          key: 'wallPerimeter-' + i,
        }))
      }
    }
    if (voicesPillar.length !== POOL_SIZE_PILLAR) {
      for (const v of voicesPillar) { try { v.destroy() } catch (_) {} }
      voicesPillar = []
      for (let i = 0; i < POOL_SIZE_PILLAR; i++) {
        voicesPillar.push(A().makeProp({
          build: buildPillarVoice,
          x: 0, y: 0, gain: 0, normalize: true,
          key: 'wallPillar-' + i,
        }))
      }
    }
  }

  function destroyAll() {
    for (const v of voicesPerimeter) { try { v.destroy() } catch (_) {} }
    for (const v of voicesPillar)    { try { v.destroy() } catch (_) {} }
    voicesPerimeter = []
    voicesPillar = []
  }

  // A segment is a perimeter wall iff it's a horizontal run on the top
  // or bottom edge, or a vertical run on the left or right edge. We
  // dispatch on `seg.horiz` rather than checking endpoints alone — a
  // vertical east-perimeter segment runs from y=0 to y=gapTop-1, so its
  // y0 is also 0; without checking horiz we'd misclassify it as a
  // north-perimeter horizontal segment.
  function isPerimeterSegment(seg, cols, rows) {
    if (seg.horiz === false) {
      return seg.x0 === 0 || seg.x1 === cols - 1
    }
    return seg.y0 === 0 || seg.y1 === rows - 1
  }

  // Returns true if `seg` is a perimeter wall segment on an edge whose
  // exit gap the player is currently aligned with — so we can silence it
  // and make the gap audibly read as "no wall here." Pillars never get
  // this treatment — they're real navigation hazards.
  function flanksAlignedGap(seg, exits, px, py, cols, rows) {
    const M = 0.35
    if (seg.horiz === false) {
      // Vertical segment — must be on east or west perimeter.
      if (seg.x0 !== 0 && seg.x1 !== cols - 1) return false
      const dir = (seg.x0 === 0) ? 'W' : 'E'
      const gap = exits[dir]
      if (!gap) return false
      const ys = gap.map((c) => c.y)
      const yMin = Math.min.apply(null, ys)
      const yMax = Math.max.apply(null, ys) + 1
      return py >= yMin + M && py <= yMax - M
    }
    // Horizontal segment — must be on north or south perimeter.
    if (seg.y0 !== 0 && seg.y1 !== rows - 1) return false
    const dir = (seg.y0 === 0) ? 'N' : 'S'
    const gap = exits[dir]
    if (!gap) return false
    const xs = gap.map((c) => c.x)
    const xMin = Math.min.apply(null, xs)
    const xMax = Math.max.apply(null, xs) + 1
    return px >= xMin + M && px <= xMax - M
  }

  // Closest point on a segment to the player, with the segment.
  function rankSegments(segments, px, py) {
    const out = []
    for (const seg of segments) {
      out.push({seg, p: roomNearestPoint(seg, px, py)})
    }
    out.sort((a, b) => a.p.dist - b.p.dist)
    return out
  }

  // Inline copy of room.nearestPointOnSegment so we can pass arbitrary
  // segment subsets — room only exposes "nearest N across all segments."
  function roomNearestPoint(seg, x, y) {
    const sx0 = seg.x0, sy0 = seg.y0
    const sx1 = seg.x1 + 1, sy1 = seg.y1 + 1
    const px = Math.max(sx0, Math.min(x, sx1))
    const py = Math.max(sy0, Math.min(y, sy1))
    const dx = x - px, dy = y - py
    return {x: px, y: py, dist: Math.sqrt(dx * dx + dy * dy)}
  }

  function applyVoice(v, ranked, near, far, pow, cap) {
    if (!ranked) { v.setGain(0); return }
    v.setPosition(ranked.p.x, ranked.p.y)
    const d = ranked.p.dist
    let g
    if (d <= near) g = 1
    else if (d >= far) g = 0
    else {
      const t = (far - d) / (far - near)
      g = Math.pow(t, pow)
    }
    v.setGain(Math.min(cap, g) * busGain)
  }

  function frame() {
    if (!content.player) return
    ensurePools()
    const p = content.player.getPosition()
    const room = R()
    const cols = room.cols(), rows = room.rows()
    const exits = room.exits ? room.exits() : null
    const allSegments = room.wallSegments()

    // Partition into perimeter / pillar, dropping any perimeter segments
    // the player is currently aligned with through their gap.
    const perimeter = []
    const pillar = []
    for (const seg of allSegments) {
      if (isPerimeterSegment(seg, cols, rows)) {
        if (exits && flanksAlignedGap(seg, exits, p.x, p.y, cols, rows)) continue
        perimeter.push(seg)
      } else {
        pillar.push(seg)
      }
    }

    const rankedPerimeter = rankSegments(perimeter, p.x, p.y).slice(0, POOL_SIZE_PERIMETER)
    const rankedPillar    = rankSegments(pillar,    p.x, p.y).slice(0, POOL_SIZE_PILLAR)

    for (let i = 0; i < voicesPerimeter.length; i++) {
      applyVoice(voicesPerimeter[i], rankedPerimeter[i],
        PERIMETER_PROX_NEAR, PERIMETER_PROX_FAR, PERIMETER_PROX_POW, PERIMETER_PEAK_CAP)
    }
    for (let i = 0; i < voicesPillar.length; i++) {
      applyVoice(voicesPillar[i], rankedPillar[i],
        PILLAR_PROX_NEAR, PILLAR_PROX_FAR, PILLAR_PROX_POW, PILLAR_PEAK_CAP)
    }
  }

  return {
    setBusGain,
    busGain: () => busGain,
    frame,
    destroyAll,
    poolSize: () => POOL_SIZE_PERIMETER + POOL_SIZE_PILLAR,
    // Exposed for the learn screen to audition each timbre.
    _buildPerimeterVoice: buildPerimeterVoice,
    _buildPillarVoice: buildPillarVoice,
  }
})()
