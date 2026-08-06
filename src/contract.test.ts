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

  test('mutating describe() output cannot disarm the gate', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    const desc = gate.describe()
    desc['app.order']!.required = []
    delete desc['app.order']
    const verdict = gate.check('app.order', {}, {
      root: 'app.order',
      proposed: {},
    })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('Missing item')
  })

  test('mutating the schema passed to agentContract cannot disarm the gate', () => {
    const live = JSON.parse(JSON.stringify(orderSchema))
    const gate = agentContract({ 'app.order': live })
    live.required = []
    live.properties.qty.type = 'string'
    const verdict = gate.check('app.order', {}, {
      root: 'app.order',
      proposed: { item: 'plum', qty: 'not a number' },
    })
    expect(verdict).toBeInstanceOf(Error)
    // builders share .schema too — same guarantee
    const built = s.object({ n: s.number })
    const builtGate = agentContract({ 'app.b': built })
    ;(built.schema as any).required = []
    expect(
      builtGate.check('app.b', {}, { root: 'app.b', proposed: {} })
    ).toBeInstanceOf(Error)
  })

  test('schemas using keywords validate does not enforce are refused at construction', () => {
    expect(() =>
      agentContract({ 'app.x': { type: 'number', not: { const: 5 } } })
    ).toThrow('not')
    expect(() =>
      agentContract({ 'app.x': { oneOf: [{ type: 'string' }] } })
    ).toThrow('oneOf')
    expect(() =>
      agentContract({ 'app.x': { type: 'number', exclusiveMinimum: 0 } })
    ).toThrow('exclusiveMinimum')
    // nested occurrences are found too, with their schema path named
    expect(() =>
      agentContract({
        'app.x': {
          type: 'object',
          properties: { deep: { allOf: [{ type: 'number' }] } },
        },
      })
    ).toThrow('root.properties.deep.allOf')
    // enforced keywords (anyOf, $predicate, plain constraints) still pass
    expect(() =>
      agentContract({
        'app.ok': {
          anyOf: [{ type: 'string' }, { type: 'number', minimum: 0 }],
        },
      })
    ).not.toThrow()
  })

  test('a contracted-root write without a proposal fails closed (protocol breach)', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    const atRoot = gate.check('app.order', { item: 'x', qty: 1 })
    expect(atRoot).toBeInstanceOf(Error)
    expect((atRoot as Error).message).toContain('without a proposal')
    // sub-path writes, dot- and bracket-style, breach too
    expect(gate.check('app.order.qty', 5)).toBeInstanceOf(Error)
    const docs = agentContract({ 'wp.docs': { type: 'array' } })
    expect(gate.check('app.order[0]', 5)).toBeInstanceOf(Error)
    expect(docs.check('wp.docs[2].title', 'x')).toBeInstanceOf(Error)
    // a sibling that merely shares the root as a prefix is NOT contracted
    expect(gate.check('app.orders', 5)).toBe(true)
  })

  test('a mismatched or uncontracted proposal.root cannot disarm the gate', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    // bogus root for a contracted write
    const bogus = gate.check('app.order.qty', 'x', {
      root: 'app.bogus',
      proposed: 'anything',
    })
    expect(bogus).toBeInstanceOf(Error)
    expect((bogus as Error).message).toContain("'app.bogus'")
    // near-miss root string
    expect(
      gate.check('app.order.qty', 'x', {
        root: 'app.orderX',
        proposed: 'anything',
      })
    ).toBeInstanceOf(Error)
    // the matching root still validates normally
    expect(
      gate.check('app.order.qty', 2, {
        root: 'app.order',
        proposed: { item: 'plum', qty: 2 },
      })
    ).toBe(true)
  })

  test('a write ABOVE a contracted root fails closed without a proposal for it', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    // ancestor write, no proposal: would replace the contracted subtree
    const clobber = gate.check('app', { order: { garbage: true } })
    expect(clobber).toBeInstanceOf(Error)
    expect((clobber as Error).message).toContain('without a proposal')
    // ancestor write with an uncontracted proposal.root breaches too
    expect(
      gate.check('app', { order: {} }, { root: 'app.other', proposed: {} })
    ).toBeInstanceOf(Error)
    // ancestor write WITH a proposal for the affected root is judged normally
    expect(
      gate.check(
        'app',
        { order: { item: 'plum', qty: 2 } },
        { root: 'app.order', proposed: { item: 'plum', qty: 2 } }
      )
    ).toBe(true)
    expect(
      gate.check(
        'app',
        { order: { item: 'plum' } },
        { root: 'app.order', proposed: { item: 'plum' } }
      )
    ).toBeInstanceOf(Error)
  })

  test('formats validate does not enforce are refused at construction', () => {
    expect(() =>
      agentContract({ 'app.x': { type: 'string', format: 'hostname' } })
    ).toThrow("format:'hostname'")
    // enforced formats pass
    expect(() =>
      agentContract({ 'app.x': { type: 'string', format: 'email' } })
    ).not.toThrow()
  })

  test('the gate refuses smuggled extra keys (additionalProperties: false)', () => {
    const gate = agentContract({ 'app.user': s.object({ name: s.string }) })
    const verdict = gate.check('app.user', {}, {
      root: 'app.user',
      proposed: { name: 'x', evil: { anything: true } },
    })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('Unexpected evil')
  })

  test('a whole-root delete (proposed: undefined) fails closed', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    expect(
      gate.check('app.order', undefined, {
        root: 'app.order',
        proposed: undefined,
      })
    ).toBeInstanceOf(Error)
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
