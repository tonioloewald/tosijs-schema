import { describe, test, expect } from 'bun:test'
import { s, validate, setPredicateEvaluator, ENFORCED_KEYWORDS } from './schema'
import {
  agentContract,
  checkExamples,
  unenforcedKeywords,
  KEYWORD_SHAPES,
  CONSTRAINT_DOMAINS,
} from './contract'

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
    expect((described['app.order'] as any).examples.length).toBe(2)
    expect((described['app.order'] as any).$counterexamples.length).toBe(3)
  })

  test('mutating describe() output cannot disarm the gate', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    const desc = gate.describe()
    ;(desc['app.order'] as any).required = []
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
      agentContract({ 'app.x': { type: 'object', allOf: [{ type: 'object' }] } })
    ).toThrow('allOf')
    expect(() =>
      agentContract({ 'app.x': { type: 'string', patternProperties: {} } as any })
    ).toThrow('patternProperties')
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
    // 1.8.0: oneOf and exclusive* are enforced now, so the gate ACCEPTS them
    // (they used to be refused as unenforced keywords)
    const g = agentContract({
      'app.shape': { oneOf: [{ type: 'string' }, { type: 'number' }] },
      'app.pos': { type: 'number', exclusiveMinimum: 0 },
    })
    expect(g.check('app.pos', 0, { root: 'app.pos', proposed: 0 })).toBeInstanceOf(Error)
    expect(g.check('app.pos', 0, { root: 'app.pos', proposed: 5 })).toBe(true)
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

  test('prototype-named keys cannot be smuggled through the gate', () => {
    const gate = agentContract({ 'app.u': s.object({ a: s.number }) })
    const verdict = gate.check('app.u', {}, {
      root: 'app.u',
      proposed: { a: 1, constructor: { evil: true } },
    })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('Unexpected constructor')
  })

  test('an ancestor write spanning several contracted roots is refused', () => {
    const gate = agentContract({
      'app.order': s.object({ qty: s.number }),
      'app.user': s.object({ name: s.string }),
    })
    // one proposal cannot cover both roots the write replaces
    const verdict = gate.check(
      'app',
      { order: { qty: 1 }, user: 12345 },
      { root: 'app.order', proposed: { qty: 1 } }
    )
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain("'app.user'")
    expect((verdict as Error).message).toContain('decompose')
  })

  test('the empty write path is an ancestor of every contracted root', () => {
    const gate = agentContract({ 'app.order': orderSchema })
    const verdict = gate.check('', { app: { order: 'clobbered' } })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('without a proposal')
  })

  test('nested contracted roots are refused at construction', () => {
    expect(() =>
      agentContract({
        'app.order': orderSchema,
        'app.order.qty': { type: 'number' },
      })
    ).toThrow('nested under')
  })

  test('uncapped tuple items are refused at construction; s.tuple passes', () => {
    expect(() =>
      agentContract({
        'app.t': {
          type: 'array',
          items: [{ type: 'number' }, { type: 'number' }],
        },
      })
    ).toThrow('tuple without maxItems')
    expect(() =>
      agentContract({
        'app.t': {
          type: 'array',
          items: [{ type: 'number' }, { type: 'number' }],
          additionalItems: false,
        },
      })
    ).toThrow('additionalItems')
    // the builder emits min/maxItems = tuple length, so it constructs fine
    expect(() =>
      agentContract({ 'app.t': s.tuple([s.number, s.number]) })
    ).not.toThrow()
  })

  test('a contracted $predicate with no registered evaluator refuses writes', () => {
    const gate = agentContract({
      'app.n': { type: 'number', $predicate: '(n) => n > 100' },
    })
    const closed = gate.check('app.n', 5, { root: 'app.n', proposed: 5 })
    expect(closed).toBeInstanceOf(Error)
    expect((closed as Error).message).toContain('no evaluator is registered')
    // with an evaluator, the predicate settles it
    const prev = setPredicateEvaluator((source, value) => (0, eval)(source)(value))
    try {
      expect(gate.check('app.n', 5, { root: 'app.n', proposed: 5 })).toBeInstanceOf(Error)
      expect(gate.check('app.n', 500, { root: 'app.n', proposed: 500 })).toBe(true)
    } finally {
      setPredicateEvaluator(prev)
    }
  })

  test('boolean schemas are enforced: false forbids, true allows', () => {
    // `properties: { key: false }` is the standard "this key is forbidden" idiom
    const gate = agentContract({
      'app.x': {
        type: 'object',
        properties: { allowed: { type: 'number' }, forbidden: false },
        required: ['allowed'],
        additionalProperties: false,
      },
    })
    expect(
      gate.check('app.x', 0, { root: 'app.x', proposed: { allowed: 1 } })
    ).toBe(true)
    const verdict = gate.check('app.x', 0, {
      root: 'app.x',
      proposed: { allowed: 1, forbidden: 666 },
    })
    expect(verdict).toBeInstanceOf(Error)
    // a root-level `false` contract refuses every write (deliberate lock)
    const locked = agentContract({ 'app.locked': false })
    expect(
      locked.check('app.locked', 1, { root: 'app.locked', proposed: 1 })
    ).toBeInstanceOf(Error)
  })

  test('unknown keywords — typos, unimplemented spec keys — are refused at construction', () => {
    expect(() =>
      agentContract({ 'app.x': { type: 'number', minumum: 5 } as any })
    ).toThrow('minumum')
    expect(() =>
      agentContract({
        'app.x': { type: 'string', contentEncoding: 'base64' } as any,
      })
    ).toThrow('contentEncoding')
    expect(() =>
      agentContract({ 'app.x': { $dynamicRef: '#thing' } as any })
    ).toThrow('$dynamicRef')
    // annotations and x-* extension keys remain legal
    expect(() =>
      agentContract({
        'app.ok': {
          type: 'number',
          title: 'fine',
          description: 'fine',
          default: 1,
          'x-custom': true,
        },
      })
    ).not.toThrow()
  })

  test('an invalid pattern regex is refused at construction, and validate fails closed on it', () => {
    expect(() =>
      agentContract({ 'app.p': { type: 'string', pattern: '(' } })
    ).toThrow('invalid regex')
    // validate itself must not throw — it fails closed
    expect(validate('abc', { type: 'string', pattern: '[' })).toBeFalse()
  })

  test('constraints that could never match are refused at construction', () => {
    expect(() =>
      agentContract({ 'app.c': { const: { deep: true } } as any })
    ).toThrow('non-primitive')
    expect(() =>
      agentContract({ 'app.e': { enum: [1, { deep: true }] } as any })
    ).toThrow('non-primitive')
    // multi-type arrays are enforced with union semantics since 1.6.0 —
    // legal in a gate, and the gate actually enforces the union
    const mt = agentContract({ 'app.m': { type: ['string', 'number'] } })
    expect(mt.check('app.m', 0, { root: 'app.m', proposed: 5 })).toBe(true)
    expect(mt.check('app.m', 0, { root: 'app.m', proposed: 'x' })).toBe(true)
    expect(
      mt.check('app.m', 0, { root: 'app.m', proposed: true })
    ).toBeInstanceOf(Error)
    // [T, 'null'] (what .optional emits) stays legal
    expect(() =>
      agentContract({ 'app.opt': { type: ['string', 'null'] } })
    ).not.toThrow()
  })

  test('typeless constraints are refused at construction (null/mismatched primitives bypass them)', () => {
    // the B1 shape: typeless applicators — validate(null, …) would be true
    expect(() =>
      agentContract({
        'app.user': {
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
      })
    ).toThrow('add an explicit type')
    // same class: typeless string/numeric constraints, enum, $predicate
    expect(() => agentContract({ 'app.a': { minLength: 5 } })).toThrow('add an explicit type')
    expect(() => agentContract({ 'app.b': { enum: ['a'] } })).toThrow('add an explicit type')
    expect(() => agentContract({ 'app.c': { $predicate: '(n) => n > 0' } })).toThrow('add an explicit type')
    // const and anyOf constrain before the null early-out — they stay legal
    expect(() => agentContract({ 'app.d': { const: 5 } })).not.toThrow()
    expect(() =>
      agentContract({ 'app.e': { anyOf: [{ type: 'string' }] } })
    ).not.toThrow()
  })

  test('malformed keyword value shapes are refused at construction', () => {
    expect(() => agentContract({ 'app.x': { anyOf: {} } as any })).toThrow('anyOf')
    expect(() =>
      agentContract({ 'app.x': { type: 'object', required: 42 } as any })
    ).toThrow('array of strings')
    expect(() =>
      agentContract({ 'app.x': { type: 'object', required: 'name' } as any })
    ).toThrow('array of strings')
    expect(() =>
      agentContract({ 'app.x': { type: 'number', minimum: 'low' } as any })
    ).toThrow('must be a number')
    expect(() =>
      agentContract({ 'app.x': { type: 'object', properties: [] } as any })
    ).toThrow('properties')
  })

  test('cross-type dead constraints are refused at construction', () => {
    expect(() =>
      agentContract({ 'app.x': { type: 'number', minLength: 5 } })
    ).toThrow('never applies')
    expect(() =>
      agentContract({ 'app.x': { type: 'string', minimum: 5 } })
    ).toThrow('never applies')
    expect(() =>
      agentContract({ 'app.x': { type: 'object', items: { type: 'number' } } })
    ).toThrow('never applies')
  })

  test('a gate advertising an enum refuses null unless the enum lists it', () => {
    const gate = agentContract({
      x: { type: ['null', 'string'], enum: ['a', 'b'] },
    })
    expect(gate.check('x', null, { root: 'x', proposed: null })).toBeInstanceOf(Error)
    expect(gate.check('x', 'a', { root: 'x', proposed: 'a' })).toBe(true)
    const nullable = agentContract({
      x: { type: ['null', 'string'], enum: ['a', null] },
    })
    expect(nullable.check('x', null, { root: 'x', proposed: null })).toBe(true)
  })

  test('sibling constraints beside anyOf/const are enforced by the gate', () => {
    const g1 = agentContract({ r: { const: 'ab', minLength: 5 } })
    expect(g1.check('r', 0, { root: 'r', proposed: 'ab' })).toBeInstanceOf(Error)
    const g2 = agentContract({ r: { anyOf: [{ type: 'string' }], maxLength: 2 } })
    expect(g2.check('r', 0, { root: 'r', proposed: 'xxxx' })).toBeInstanceOf(Error)
    expect(g2.check('r', 0, { root: 'r', proposed: 'xx' })).toBe(true)
  })

  test('a NESTED $predicate with no evaluator also refuses writes', () => {
    const gate = agentContract({
      'app.o': {
        type: 'object',
        properties: { n: { type: 'number', $predicate: '(n) => n > 0' } },
      },
    })
    const verdict = gate.check('app.o', 0, {
      root: 'app.o',
      proposed: { n: 5 },
    })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('no evaluator is registered')
  })

  test('malformed child nodes are refused as not-a-schema at construction', () => {
    expect(() =>
      agentContract({
        'app.x': { type: 'object', properties: { a: 42 } } as any,
      })
    ).toThrow('not a schema')
  })

  test('check() never throws — even a throwing predicate evaluator fails closed', () => {
    const gate = agentContract({
      'app.n': { type: 'number', $predicate: '(n) => n > 0' },
    })
    const prev = setPredicateEvaluator(() => {
      throw new Error('evaluator exploded')
    })
    try {
      const verdict = gate.check('app.n', 5, { root: 'app.n', proposed: 5 })
      expect(verdict).toBeInstanceOf(Error)
      expect((verdict as Error).message).toContain('internal validation error')
    } finally {
      setPredicateEvaluator(prev)
    }
  })

  test("a root literally named '__proto__' is a first-class contracted root", () => {
    const gate = agentContract({
      ['__proto__']: {
        type: 'object',
        properties: { x: { type: 'number' } },
        required: ['x'],
        additionalProperties: false,
      },
      ['constructor']: { type: 'number' },
    })
    // the roots exist — not silently dropped by prototype assignment
    const described = gate.describe()
    expect(Object.getOwnPropertyNames(described)).toContain('__proto__')
    expect(Object.getOwnPropertyNames(described)).toContain('constructor')
    // and they gate: no proposal = breach, bad proposal = violation
    expect(gate.check('__proto__.x', 'evil')).toBeInstanceOf(Error)
    expect(
      gate.check('__proto__', 0, { root: '__proto__', proposed: { x: 'bad' } })
    ).toBeInstanceOf(Error)
    expect(
      gate.check('__proto__', 0, { root: '__proto__', proposed: { x: 1 } })
    ).toBe(true)
    expect(
      gate.check('constructor', 0, { root: 'constructor', proposed: 7 })
    ).toBe(true)
  })

  test('drift guard: every enforced keyword has a construction-time shape check', () => {
    const shapeKeys = new Set(KEYWORD_SHAPES.map(([key]) => key))
    const domainKeys = new Set(CONSTRAINT_DOMAINS.map(([key]) => key))
    for (const keyword of ENFORCED_KEYWORDS) {
      // const accepts any JSON value and x-tjs-undefined is a boolean marker
      // consumed by the walk directly — everything else must be shape-checked
      if (keyword === 'const' || keyword === 'x-tjs-undefined') continue
      expect(shapeKeys.has(keyword)).toBeTrue()
    }
    // every domain-restricted keyword is itself an enforced keyword
    for (const keyword of domainKeys) {
      expect(ENFORCED_KEYWORDS.has(keyword)).toBeTrue()
    }
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
    expect((gate.describe()['app.cart'] as any).$predicate).toBe(
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

  test('an example under an unevaluated $predicate is unverifiable, not silently passed', () => {
    const findings = checkExamples({
      type: 'number',
      $predicate: '(n) => n > 100',
      examples: [5],
    })
    expect(findings).toEqual([
      { schemaPath: 'root', kind: 'example', index: 0, problem: 'unverifiable' },
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

describe('unenforcedKeywords — the honesty lint (#8)', () => {
  test('empty when the schema is fully within the enforced subset', () => {
    expect(unenforcedKeywords({ type: 'object', properties: { a: { type: 'number' } } })).toEqual([])
    // oneOf and exclusive bounds are enforced as of 1.8.0 → not listed
    expect(unenforcedKeywords({ oneOf: [{ type: 'string' }] })).toEqual([])
    expect(unenforcedKeywords({ type: 'number', exclusiveMinimum: 0 })).toEqual([])
  })

  test('lists unenforced keywords with their schema path, never throws', () => {
    expect(unenforcedKeywords({ type: 'object', allOf: [{ type: 'object' }] })).toEqual(['root.allOf'])
    expect(unenforcedKeywords({ not: { type: 'string' } })).toEqual(['root.not'])
    const nested = unenforcedKeywords({
      type: 'object',
      properties: { a: { $ref: '#/$defs/s' } },
      patternProperties: { '^x': { type: 'string' } },
    })
    expect(nested).toContain('root.patternProperties')
    expect(nested).toContain('root.properties.a.$ref')
    // it reports, it does not throw (unlike agentContract on the same schema)
    expect(() => unenforcedKeywords({ if: {}, then: {} })).not.toThrow()
    expect(unenforcedKeywords({ if: {}, then: {} }).sort()).toEqual(['root.if', 'root.then'])
  })

  test('a schema unenforcedKeywords flags is exactly one agentContract refuses', () => {
    const schema = { type: 'object', allOf: [{ type: 'object' }] }
    expect(unenforcedKeywords(schema).length).toBeGreaterThan(0)
    expect(() => agentContract({ 'app.x': schema })).toThrow()
  })

  // guards the enforcedChildren union walk (contract.ts): it recurses into
  // BOTH anyOf and oneOf branches. If that regressed to anyOf-only, an
  // unenforced keyword hidden inside a oneOf branch would go unreported and
  // the fail-closed gate would fail OPEN — with every other test still green.
  test('an unenforced keyword nested inside a oneOf/anyOf branch is still found (fail-closed honesty walk)', () => {
    expect(
      unenforcedKeywords({ oneOf: [{ allOf: [{ type: 'object' }] }] })
    ).toEqual(['root.oneOf.0.allOf'])
    expect(
      unenforcedKeywords({ anyOf: [{ type: 'string' }, { not: { const: 5 } }] })
    ).toEqual(['root.anyOf.1.not'])
    // and the gate refuses both, naming the branch path
    expect(() =>
      agentContract({ 'app.x': { oneOf: [{ allOf: [{ type: 'object' }] }] } })
    ).toThrow('root.oneOf.0.allOf')
    expect(() =>
      agentContract({ 'app.x': { anyOf: [{ type: 'string' }, { not: { const: 5 } }] } })
    ).toThrow('root.anyOf.1.not')
  })
})
