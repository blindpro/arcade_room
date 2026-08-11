// Small shared helpers for SURGE.
content.util = (() => {
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
  const lerp = (a, b, t) => a + (b - a) * t
  const rand = (lo, hi) => lo + Math.random() * (hi - lo)
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1))
  const chance = p => Math.random() < p
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]
  const dist2 = (a, b) => {
    const dx = a.x - b.x, dz = a.z - b.z
    return Math.sqrt(dx * dx + dz * dz)
  }
  const now = () => Date.now()
  const pad = (n, l) => String(n).padStart(l || 2, '0')
  const fmtTime = ms => {
    const s = Math.max(0, Math.floor(ms / 1000))
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60)
  }
  const fmtDist = m => (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.floor(m) + ' m')
  const today = () => {
    const d = new Date()
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }
  const round = (v, p) => { const k = Math.pow(10, p || 0); return Math.round(v * k) / k }
  return {clamp, lerp, rand, randInt, chance, pick, dist2, now, pad, fmtTime, fmtDist, today, round}
})()
