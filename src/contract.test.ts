import { describe, test, expect } from 'bun:test'
import { s, validate, setPredicateEvaluator } from './schema'
import { agentContract, checkExamples } from './contract'

const orderSchema = {
  type: 'object',
  properties: {
    item: { type: 'string' },
    qty: { type: 'number' },
  },
  required: ['item', 'qty'],
  examples: [
    { item: 'kumquat', qty: 3 },
    { item: 'fig', qty: 1 },
  ],
  $counterexamples: [
    { item: 'kumquat' }, // missing qty
    { item: 42, qty: 1 }, // wrong type
    'not even an object',
  ],
}

// --- 1. EXTENSION-KEY PASSTHROUGH (the documented guarantee) ---
describe('$-prefixed extension keys pass through validate untouched', () => {
  test('unknown $ keys and examples/$counterexamples never affect the verdict', () => {
    const schema = {
      ...orderSchema,
      $exercise: [{ write: 'whatever' }],
      $totallyMadeUp: { nested: true },
    }
    expect(validate({ item: 'plum', qty: 2 }, schema)).toBeTrue()
    expect(validate({ item: 'plum' }, schema)).toBeFalse()
  })

  test('validate does not mutate the schema object', () => {
    const schema = { ...orderSchema, $custom: [1, 2, 3] }
    const before = JSON.stringify(schema)
    validate({ item: 'plum', qty: 2 }, schema)
    validate('garbage', schema)
    expect(JSON.stringify(schema)).toBe(before)
  })
})

// --- 2. AGENT CONTRACT ADAPTER ---
describe('agentContract — the blessed seam adapter', () => {
  const contract = agentContract({ 'app.order': orderSchema })

  test('no proposal (write outside any contracted root) passes', () => {
    expect(contract.check('app.scratch', 'anything')).toBe(true)
  })

  test('a proposal for an uncontracted root passes', () => {
    expect(
      contract.check('other.thing', 1, { root: 'other.thing', proposed: 1 })
    ).toBe(true)
  })

  test('a valid whole-root proposal passes; the leaf value is ignored', () => {
    expect(
      contract.check('app.order.qty', 'leaf ignored', {
        root: 'app.order',
        proposed: { item: 'yuzu', qty: 2 },
      })
    ).toBe(true)
  })

  test('a violating proposal returns an Error naming the path and reasons', () => {
    const verdict = contract.check('app.order.qty', 'x', {
      root: 'app.order',
      proposed: { item: 'yuzu', qty: 'x' },
    })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain(
      'contract violation at app.order.qty'
    )
    expect((verdict as Error).message).toContain('qty')
  })

  test('deep-edit judged in root context: missing required sibling refused', () => {
    const docs = agentContract({
      'wp.docs': s.array(s.object({ title: s.string, body: s.string })),
    })
    const verdict = docs.check('wp.docs[0]', { title: 'orphan' }, {
      root: 'wp.docs',
      proposed: [{ title: 'orphan' }],
    })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('Missing body')
  })

  test('strict by default: a bad item at an unsampled index is still refused', () => {
    const gate = agentContract({
      'app.nums': { type: 'array', items: { type: 'number' } },
    })
    const proposed: any[] = Array.from({ length: 500 }, (_, i) => i)
    proposed[3] = 'bad'
    expect(
      gate.check('app.nums', proposed, { root: 'app.nums', proposed })
    ).toBeInstanceOf(Error)
    // opting out of strictness restores sampled (gappy) validation
    const sampled = agentContract(
      { 'app.nums': { type: 'array', items: { type: 'number' } } },
      { strict: false }
    )
    expect(
      sampled.check('app.nums', proposed, { root: 'app.nums', proposed })
    ).toBe(true)
  })

  test('describe() returns plain serializable JSON, builders unwrapped', () => {
    const built = agentContract({
      'app.user': s.object({ name: s.string.min(1) }),
      'app.order': orderSchema,
    })
    const described = built.describe()
    expect(described['app.user']).toEqual({
      type: 'object',
      properties: { name: { type: 'string', minLength: 1 } },
      required: ['name'],
      additionalProperties: false,
    })
    // round-trips as JSON — nothing but data in there
    expect(JSON.parse(JSON.stringify(described))).toEqual(described)
    // examples and $counterexamples travel with the contract
    expect(described['app.order']!.examples!.length).toBe(2)
    expect((described['app.order'] as any).$counterexamples.length).toBe(3)
  })

  test('$predicate strings ride into describe() even with no evaluator', () => {
    const gate = agentContract({
      'app.cart': {
        type: 'array',
        $predicate: '(cart) => cart.length >= 3',
      },
    })
    expect(gate.describe()['app.cart']!.$predicate).toBe(
      '(cart) => cart.length >= 3'
    )
  })
})

// --- 3. EXAMPLES LINT ---
describe('checkExamples — the spec proves itself at definition time', () => {
  test('a truthful schema yields no findings', () => {
    expect(checkExamples(orderSchema)).toEqual([])
  })

  test('an example its own schema refuses is reported with reasons', () => {
    const lying = { ...orderSchema, examples: [{ item: 'plum' }] }
    const findings = checkExamples(lying)
    expect(findings.length).toBe(1)
    expect(findings[0]).toMatchObject({
      schemaPath: 'root',
      kind: 'example',
      index: 0,
      problem: 'rejected',
    })
    expect(findings[0]!.reasons!.join('; ')).toContain('Missing qty')
  })

  test('a counterexample the schema accepts is reported', () => {
    const toothless = {
      type: 'object',
      properties: { qty: { type: 'number' } },
      $counterexamples: [{ qty: 1 }], // schema has no required — this passes
    }
    const findings = checkExamples(toothless)
    expect(findings).toEqual([
      {
        schemaPath: 'root',
        kind: 'counterexample',
        index: 0,
        problem: 'accepted',
      },
    ])
  })

  test('examples nested anywhere in the schema tree are exercised', () => {
    const nested = s.object({
      qty: s.number.meta({ examples: [3, 'not a number'] }),
    })
    const findings = checkExamples(nested)
    expect(findings.length).toBe(1)
    expect(findings[0]).toMatchObject({
      schemaPath: 'root.properties.qty',
      kind: 'example',
      index: 1,
      problem: 'rejected',
    })
  })

  test('lint runs strict: a lying example at an unsampled index is caught', () => {
    const items: any[] = Array.from({ length: 500 }, (_, i) => i)
    items[3] = 'bad'
    const schema = {
      type: 'array',
      items: { type: 'number' },
      examples: [items],
    }
    expect(checkExamples(schema).length).toBe(1)
  })

  test('counterexample under $predicate with no evaluator is unverifiable, not accepted', () => {
    const carted = {
      type: 'array',
      items: { type: 'number' },
      $predicate: '(cart) => cart.length >= 3',
      $counterexamples: [[1]], // structurally fine; only the predicate refuses it
    }
    expect(checkExamples(carted)).toEqual([
      {
        schemaPath: 'root',
        kind: 'counterexample',
        index: 0,
        problem: 'unverifiable',
      },
    ])
  })

  test('with an evaluator registered the predicate settles the verdict', () => {
    const carted = {
      type: 'array',
      items: { type: 'number' },
      $predicate: '(cart) => cart.length >= 3',
      $counterexamples: [[1], [1, 2, 3]],
    }
    const prev = setPredicateEvaluator((source, value) =>
      // stand-in engine for the test; real consumers register e.g. tjs-lang
      (0, eval)(source)(value)
    )
    try {
      const findings = checkExamples(carted)
      // [1] is now genuinely refused; [1,2,3] passes and is a real finding
      expect(findings).toEqual([
        {
          schemaPath: 'root',
          kind: 'counterexample',
          index: 1,
          problem: 'accepted',
        },
      ])
    } finally {
      setPredicateEvaluator(prev)
    }
  })
})
