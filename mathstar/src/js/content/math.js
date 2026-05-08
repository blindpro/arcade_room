// Math operation generator + difficulty curve.
//
// generateOperation(level) returns:
//   {
//     op:        '+' | '-' | '*' | '/',
//     a:         number,
//     b:         number,
//     expr:      string for HUD ("12 + 7"),
//     answer:    number,
//     answerStr: string ("19"),
//     digits:    ['1','9'],     // each char is a single digit char
//   }
//
// Difficulty curve (level → ops + ranges):
//   1   +              a,b ∈ [1,5]
//   2   +              a,b ∈ [1,9]
//   3   +,-            [2,12], a≥b for −
//   4   +,-            [5,25]
//   5   *              [1,9] × [1,9]
//   6   +,-,*          mixed; * stays single-digit
//   7   +,-,*          *: [2,15] × [2,9]
//   8   +,-,*,/        / exact: a/b ∈ [1,12]
//   9+  +,-,*,/        wider ranges
content.math = (() => {
  function rint(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1))
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  function opPool(level) {
    if (level <= 2) return ['+']
    if (level <= 4) return ['+', '-']
    if (level === 5) return ['*']
    if (level <= 7) return ['+', '-', '*']
    return ['+', '-', '*', '/']
  }

  function rangeFor(level, op) {
    if (op === '+') {
      if (level <= 1) return [1, 5]
      if (level <= 2) return [1, 9]
      if (level <= 3) return [2, 14]
      if (level <= 4) return [5, 30]
      if (level <= 6) return [5, 50]
      if (level <= 8) return [10, 99]
      return [20, 200]
    }
    if (op === '-') {
      if (level <= 3) return [2, 14]
      if (level <= 4) return [5, 30]
      if (level <= 6) return [5, 50]
      if (level <= 8) return [10, 99]
      return [20, 200]
    }
    if (op === '*') {
      if (level <= 5) return [1, 9]
      if (level <= 6) return [1, 9]
      if (level <= 7) return [2, 15]
      if (level <= 8) return [2, 15]
      return [3, 20]
    }
    if (op === '/') {
      // Range here is the divisor (b) range; the quotient range is
      // tightened by clean-divisor logic.
      if (level <= 8) return [2, 12]
      return [2, 15]
    }
    return [1, 9]
  }

  function genAdd(level) {
    const [lo, hi] = rangeFor(level, '+')
    const a = rint(lo, hi)
    const b = rint(lo, hi)
    return {a, b, answer: a + b}
  }

  function genSub(level) {
    const [lo, hi] = rangeFor(level, '-')
    let a = rint(lo, hi)
    let b = rint(lo, hi)
    if (a < b) { const t = a; a = b; b = t }   // ensure non-negative
    return {a, b, answer: a - b}
  }

  function genMul(level) {
    if (level <= 6) {
      // Single-digit multiplication
      const a = rint(1, 9)
      const b = rint(1, 9)
      return {a, b, answer: a * b}
    }
    if (level <= 7) {
      const a = rint(2, 15)
      const b = rint(2, 9)
      return {a, b, answer: a * b}
    }
    if (level <= 8) {
      const a = rint(2, 15)
      const b = rint(2, 9)
      return {a, b, answer: a * b}
    }
    const a = rint(3, 20)
    const b = rint(2, 12)
    return {a, b, answer: a * b}
  }

  function genDiv(level) {
    // Generate a clean integer division: pick b (divisor) and quotient,
    // then a = b*q.
    const [bLo, bHi] = rangeFor(level, '/')
    const b = rint(bLo, bHi)
    const qHi = level <= 8 ? 12 : 15
    const q = rint(1, qHi)
    const a = b * q
    return {a, b, answer: q}
  }

  function generate(level) {
    const op = pick(opPool(level))
    let r
    if      (op === '+') r = genAdd(level)
    else if (op === '-') r = genSub(level)
    else if (op === '*') r = genMul(level)
    else                 r = genDiv(level)
    const opSym = (op === '*') ? '×' : (op === '/') ? '÷' : op
    const expr = `${r.a} ${opSym} ${r.b}`
    const answerStr = String(r.answer)
    const digits = answerStr.split('')
    return {
      op,
      a:         r.a,
      b:         r.b,
      expr,
      answer:    r.answer,
      answerStr,
      digits,
    }
  }

  // For HUD / announcer rendering. Operator is stored as the i18n key
  // (op.plus/op.minus/op.times/op.dividedBy) so locale changes mid-flight
  // don't strand a rendered word in state.
  function operatorKey(op) {
    if (op === '+') return 'op.plus'
    if (op === '-') return 'op.minus'
    if (op === '*') return 'op.times'
    if (op === '/') return 'op.dividedBy'
    return 'op.plus'
  }

  return {generate, operatorKey, opPool, rangeFor}
})()
