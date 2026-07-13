/**
 * Synth voice interpreter. Plays the recipe DSL (content.soundRecipes) with
 * Web Audio — the in-browser twin of the offline renderer the recipes were
 * tuned against, so what was measured is what you hear. Every original sample
 * is replaced by a synthesised voice matched to the original's spectrum.
 *
 * makeVoice(name, destination) builds the node graph for one sound, connects it
 * to `destination` (a Director channel's volume gain), starts it, and returns
 * {stop(when)}. Loops run until stopped; one-shots self-terminate.
 */
content.sounds = (() => {
  const ctx = () => engine.context()
  const recipes = () => content.soundRecipes || {}

  // --- cached noise buffers (2 s mono) ---
  const noiseCache = {}
  function noiseBuffer(color) {
    if (noiseCache[color]) return noiseCache[color]
    const c = ctx()
    const len = Math.floor(c.sampleRate * 2)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    if (color === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926
      }
    } else if (color === 'brown') {
      let last = 0
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    noiseCache[color] = buf
    return buf
  }

  const WAVE = {sine: 'sine', square: 'square', sawtooth: 'sawtooth', triangle: 'triangle', saw: 'sawtooth'}

  function applyEnv(param, env, t0, dur, isLoop, base) {
    if (!env) {
      param.setValueAtTime(0, t0)
      param.linearRampToValueAtTime(base, t0 + 0.012) // anti-click fade-in
      return
    }
    const a = env.a == null ? 0.005 : env.a
    const d = env.d == null ? 0.05 : env.d
    const sus = env.s == null ? 0.7 : env.s
    const r = env.r == null ? 0.1 : env.r
    const peak = (env.peak == null ? 1 : env.peak) * base
    param.setValueAtTime(0, t0)
    param.linearRampToValueAtTime(peak, t0 + Math.max(0.002, a))
    param.linearRampToValueAtTime(sus * base, t0 + a + Math.max(0.002, d))
    if (!isLoop) {
      param.setValueAtTime(sus * base, t0 + Math.max(a + d, dur - r))
      param.linearRampToValueAtTime(0, t0 + dur)
    }
  }

  function buildLayer(layer, out, t0, dur, isLoop, nodes) {
    const c = ctx()
    const g = layer.gain == null ? 1 : layer.gain

    const envGain = c.createGain()
    envGain.connect(out)
    applyEnv(envGain.gain, layer.env, t0, dur, isLoop, g)

    // Build the chain backwards so the signal order matches the offline
    // renderer exactly: source -> ampLfo (trem) -> filter -> env -> out.
    let node = envGain

    if (layer.filter) {
      const f = c.createBiquadFilter()
      f.type = layer.filter.type || 'lowpass'
      f.frequency.value = layer.filter.freq || 800
      f.Q.value = layer.filter.q == null ? 1 : layer.filter.q
      if (f.type === 'peaking') f.gain.value = layer.filter.gain || 0
      f.connect(node)
      if (layer.filterLfoOct) {
        const swing = (layer.filter.freq || 800) * (Math.pow(2, layer.filterLfoOct) - 1)
        const lfo = c.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = layer.filterLfoRate || 2
        const lg = c.createGain(); lg.gain.value = swing
        lfo.connect(lg); lg.connect(f.frequency); lfo.start(t0)
        nodes.push(lfo)
      }
      node = f
    }

    if (layer.ampLfoDepth) {
      const depth = Math.min(1, layer.ampLfoDepth)
      const trem = c.createGain()
      trem.gain.value = 1 - depth * 0.5
      trem.connect(node)
      const lfo = c.createOscillator()
      lfo.type = WAVE[layer.ampLfoWave] || 'sine'
      lfo.frequency.value = layer.ampLfoRate || 6
      const lg = c.createGain()
      lg.gain.value = depth * 0.5
      lfo.connect(lg); lg.connect(trem.gain); lfo.start(t0)
      nodes.push(lfo)
      node = trem
    }

    const preFilter = node

    if (layer.type === 'noise') {
      const src = c.createBufferSource()
      src.buffer = noiseBuffer(layer.color || 'white')
      src.loop = true
      src.connect(preFilter)
      src.start(t0)
      nodes.push(src)
    } else {
      const detunes = [0, ...(layer.unison || [])]
      const ug = c.createGain(); ug.gain.value = 1 / detunes.length; ug.connect(preFilter)
      let pitchLfo = null, pitchLfoGain = null
      if (layer.pitchLfoCents) {
        pitchLfo = c.createOscillator(); pitchLfo.type = 'sine'
        pitchLfo.frequency.value = layer.pitchLfoRate || 5
        pitchLfoGain = c.createGain(); pitchLfoGain.gain.value = layer.pitchLfoCents
        pitchLfo.connect(pitchLfoGain); pitchLfo.start(t0); nodes.push(pitchLfo)
      }
      for (const dt of detunes) {
        const osc = c.createOscillator()
        osc.type = WAVE[layer.wave] || 'sine'
        osc.frequency.setValueAtTime(layer.freq || 220, t0)
        if (layer.glideTo != null) osc.frequency.linearRampToValueAtTime(layer.glideTo, t0 + (layer.glideTime || dur))
        osc.detune.value = dt
        if (pitchLfoGain) pitchLfoGain.connect(osc.detune)
        osc.connect(ug); osc.start(t0); nodes.push(osc)
      }
    }
  }

  function buildNote(note, out, t0, nodes) {
    const start = t0 + (note.t || 0)
    const ndur = note.dur || 0.2
    const layer = {
      type: 'osc', wave: note.wave || 'sine', freq: note.freq,
      gain: note.gain == null ? 0.6 : note.gain, filter: note.filter,
      env: note.env || {a: 0.005, d: ndur * 0.3, s: 0.6, r: ndur * 0.5, peak: 1},
    }
    buildLayer(layer, out, start, ndur, false, nodes)
  }

  function makeVoice(name, destination) {
    const r = recipes()[name]
    if (!r) return null
    const c = ctx()
    const t0 = c.currentTime + 0.01
    const isLoop = r.kind === 'loop'
    const dur = r.dur || (isLoop ? 2 : 1)

    const outGain = c.createGain()
    outGain.gain.value = r.gain == null ? 1 : r.gain
    outGain.connect(destination)

    const nodes = []
    for (const layer of r.layers || []) buildLayer(layer, outGain, t0, dur, isLoop, nodes)
    let seqEnd = 0
    for (const note of r.seq || []) { buildNote(note, outGain, t0, nodes); seqEnd = Math.max(seqEnd, (note.t || 0) + (note.dur || 0.2)) }

    let stopped = false
    function stopAll(when) {
      if (stopped) return
      stopped = true
      const t = when == null ? c.currentTime : when
      try {
        outGain.gain.cancelScheduledValues(t)
        outGain.gain.setValueAtTime(outGain.gain.value, t)
        outGain.gain.linearRampToValueAtTime(0, t + 0.03)
      } catch (e) {}
      for (const n of nodes) { try { n.stop(t + 0.05) } catch (e) {} }
      setTimeout(() => { try { outGain.disconnect() } catch (e) {} }, 120)
    }

    if (!isLoop) {
      const end = t0 + Math.max(dur, seqEnd) + 0.15
      for (const n of nodes) { try { n.stop(end) } catch (e) {} }
      setTimeout(() => { try { outGain.disconnect() } catch (e) {} }, (Math.max(dur, seqEnd) + 0.3) * 1000)
    }

    return {stop: stopAll, isLoop}
  }

  return {makeVoice, has: (n) => n in recipes()}
})()
