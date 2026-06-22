content.math = (() => {
  const M = () => content.math
  const { randomFloat, clamp, lerp, randomSign } = engine.fn
  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1))
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }
  return {
    random: randomFloat,
    randInt,
    pick,
    clamp,
    lerp,
    sign: randomSign,
  }
})()