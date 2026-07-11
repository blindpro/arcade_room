/**
 * Director sound-channel mixer. Reproduces sound(n).volume (0..255),
 * sound(n).pan (-100..100), puppetSound(n, name) and sound(n).stop() on top of
 * syngen's AudioContext. Each channel is volume gain -> [left gain, right gain]
 * -> merger -> master bus.
 *
 * The pan is Director's LINEAR BALANCE, not Web Audio's equal-power panner: at
 * centre both sides are full and panning only attenuates the FAR side. That is
 * the positional cue the gameplay relies on to place a vehicle in the stereo
 * field, so it is reproduced exactly. Voices are synthesised (content.sounds),
 * not sampled.
 */
content.audio = (() => {
  // Lazy: content files concatenate alphabetically, so audio.js runs BEFORE
  // constants.js — capturing content.constants here would bind `undefined`.
  const C = () => content.constants
  const ctx = () => engine.context()

  let bus = null
  const channels = [] // 1-based; index 0 unused

  function ensure() {
    if (bus) return
    const c = ctx()
    bus = engine.mixer.createBus() // GainNode -> master input
    for (let i = 0; i <= 8; i++) {
      const volume = c.createGain()
      const left = c.createGain()
      const right = c.createGain()
      const merger = c.createChannelMerger(2)
      volume.connect(left); volume.connect(right)
      left.connect(merger, 0, 0); right.connect(merger, 0, 1)
      merger.connect(bus)
      channels.push({volume, left, right, voice: null})
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }

  function ch(n) { ensure(); return channels[n] }

  return {
    ready: ensure,

    /** puppetSound(channel, "name"): replace whatever is on the channel. */
    puppetSound(n, name) {
      const channel = ch(n)
      if (!channel) return
      if (channel.voice) { channel.voice.stop(); channel.voice = null }
      channel.voice = content.sounds.makeVoice(name, channel.volume)
    },

    /** sound(channel).volume = v (0..255). */
    volume(n, v) {
      const channel = ch(n)
      if (!channel) return
      const g = clamp(v, 0, C().VOLUME_MAX) / C().VOLUME_MAX
      channel.volume.gain.setTargetAtTime(g, ctx().currentTime, 0.005)
    },

    /** sound(channel).pan = p (-100..100), Director linear balance. */
    pan(n, p) {
      const channel = ch(n)
      if (!channel) return
      const pan = clamp(p, -C().PAN_MAX, C().PAN_MAX) / C().PAN_MAX
      const l = pan <= 0 ? 1 : 1 - pan
      const r = pan >= 0 ? 1 : 1 + pan
      const t = ctx().currentTime
      channel.left.gain.setTargetAtTime(l, t, 0.005)
      channel.right.gain.setTargetAtTime(r, t, 0.005)
    },

    /** sound(channel).stop(). */
    stop(n) {
      const channel = ch(n)
      if (!channel) return
      if (channel.voice) { channel.voice.stop(); channel.voice = null }
    },

    /** Stop every looping/one-shot voice (game screen exit). */
    silenceAll() {
      if (!bus) return
      for (const channel of channels) {
        if (channel && channel.voice) { channel.voice.stop(); channel.voice = null }
      }
    },
  }
})()
