import { describe, test, expect, afterEach } from 'bun:test'
import {
  validate,
  setPredicateEvaluator,
  getPredicateEvaluator,
  type PredicateEvaluator,
  type JSONSchema,
} from './schema'

/**
 * The `$predicate` keyword: progressive enhancement. A naive validator (no
 * evaluator registered) checks only the structural part; a predicate-aware one
 * (an evaluator injected via `setPredicateEvaluator`) also runs the computation.
 * The engine lives in the consumer (e.g. tjs-lang) — this library stays zero-dep,
 * so the test supplies its own tiny evaluator.
 */

// A minimal stand-in for tjs-lang's createPredicateEvaluator(): compile the
// cluster and run its LAST function. Real engines verify first (ReDoS/IO/fuel);
// here we only need to prove the wiring.
const testEvaluator: PredicateEvaluator = (source, value) => {
  const names = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map(
    (m) => m[1]
  )
  const entry = names[names.length - 1]
  if (!entry) return false
  try {
    const fn = new Function(`${source}\n;return ${entry};`)()
    return fn(value) === true
  } catch {
    return false
  }
}

// entry `isEven` (last function); a couple of helpers to look real
const EVEN_SRC = `
function isInt(x) { return typeof x === 'number' && Number.isInteger(x) }
function isEven(x) { return isInt(x) && x % 2 === 0 }
`

const evenSchema: JSONSchema = { type: 'number', $predicate: EVEN_SRC }

afterEach(() => setPredicateEvaluator(null))

describe('$predicate keyword', () => {
  test('ignored when no evaluator is registered (naive: structure only)', () => {
    // structural type still applies...
    expect(validate(4, evenSchema)).toBe(true)
    expect(validate('x', evenSchema)).toBe(false) // not a number
    // ...but the computational part is skipped, so an odd number passes.
    expect(validate(3, evenSchema)).toBe(true)
  })

  test('runs the predicate once an evaluator is registered', () => {
    setPredicateEvaluator(testEvaluator)
    expect(validate(4, evenSchema)).toBe(true)
    expect(validate(3, evenSchema)).toBe(false) // caught by $predicate
    expect(validate('x', evenSchema)).toBe(false) // still fails structural type
  })

  test('structural checks gate the predicate (type mismatch never reaches it)', () => {
    let called = 0
    setPredicateEvaluator((src, v) => {
      called++
      return testEvaluator(src, v)
    })
    validate('not a number', evenSchema)
    expect(called).toBe(0) // type failed first — predicate not consulted
    validate(2, evenSchema)
    expect(called).toBe(1)
  })

  test('reports predicate failures through onError', () => {
    setPredicateEvaluator(testEvaluator)
    const errors: string[] = []
    validate(3, evenSchema, (path, msg) => errors.push(`${path}: ${msg}`))
    expect(errors.some((e) => /Predicate/.test(e))).toBe(true)
  })

  test('$predicate on a nested property', () => {
    setPredicateEvaluator(testEvaluator)
    const schema: JSONSchema = {
      type: 'object',
      properties: { count: { type: 'number', $predicate: EVEN_SRC } },
    }
    expect(validate({ count: 2 }, schema)).toBe(true)
    expect(validate({ count: 5 }, schema)).toBe(false)
  })

  test('set/get/clear evaluator', () => {
    expect(getPredicateEvaluator()).toBe(null)
    const prev = setPredicateEvaluator(testEvaluator)
    expect(prev).toBe(null)
    expect(getPredicateEvaluator()).toBe(testEvaluator)
    setPredicateEvaluator(null)
    expect(getPredicateEvaluator()).toBe(null)
  })
})
