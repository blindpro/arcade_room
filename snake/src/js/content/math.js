content.math = (() => {
  const { randomFloat, clamp, lerp, randomSign } = engine.fn
  return {
    random: randomFloat,
    randInt: (min, max) => min + Math.floor(Math.random() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    clamp,
    lerp,
    sign: randomSign,
  }
})()