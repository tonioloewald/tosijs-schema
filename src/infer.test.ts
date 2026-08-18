import { describe, test, expect } from 'bun:test'
import { inferSchema } from './infer'
import { validate } from './schema'
import { agentContract } from './contract'

// The headline guarantee (issue #6 acceptance test): an inferred schema must
// accept the very data it was derived from. Run it against every fixture.
const accepts = (sample: unknown, opts?: any) =>
  validate(sample, inferSchema(sample, opts))

describe('inferSchema — acceptance: a schema accepts its own sample', () => {
  const fixtures: [string, unknown, any?][] = [
    ['rows with optional key', [{ id: 1, tag: 'a' }, { id: 2 }]],
    ['T | null union', [{ v: 'a' }, { v: null }, { v: 'b' }]],
    ['string | number union', [{ v: 'a' }, { v: 1 }]],
    ['nested objects', [{ u: { name: 'a', age: 1 } }, { u: { name: 'b' } }]],
    ['arrays of scalars', [1, 2, 3]],
    ['array of arrays', [[1, 2], [3]]],
    ['empty array', []],
    ['all null', [null, null]],
    ['undefined', undefined],
    ['null + undefined', [null, undefined]],
    ['scalar', 42],
    ['bool', true],
    ['deeply mixed', [{ a: [{ x: 1 }] }, { a: [{ x: 2, y: null }], b: 'z' }]],
    ['formats on', [{ at: '2020-01-01T00:00:00Z' }], { formats: true }],
    ['enums on', [{ s: 'x' }, { s: 'y' }, { s: 'x' }], { enums: true }],
    // heterogeneous same-position data (regression: M1)
    ['object OR array at one position', [{ a: 1 }, [1, 2]]],
    ['scalar OR array', [1, [2]]],
    ['object OR scalar', [{ a: 1 }, 'x']],
    ['nested object-or-array', { nested: [{ a: 1 }, [1]] }],
    ['mixed with null', [{ a: 1 }, [1], null]],
    // formats:true must never emit a format the sample would fail (M2, M3)
    ['uri near-misses under formats', [{ u: 'http://' }, { u: 'http://[' }], { formats: true }],
    ['valid uris under formats', [{ u: 'https://a.co' }, { u: 'http://b.co/x' }], { formats: true }],
    ['date-ish strings under formats', [{ d: '2020-01-01' }, { d: '2021-06-15' }], { formats: true }],
  ]
  for (const [name, sample, opts] of fixtures) {
    test(name, () => expect(accepts(sample, opts)).toBeTrue())
  }
})

describe('inferSchema — structure and requirements', () => {
  test('samples every element: a key absent from row 0 keeps its column (#1)', () => {
    const schema = inferSchema([{ id: 1 }, { id: 2, extra: 'here' }])
    const props = (schema.items as any).properties
    expect(Object.keys(props).sort()).toEqual(['extra', 'id'])
  })

  test('presence decides required; absent is optional, not null (#2)', () => {
    const items = inferSchema([{ a: 1, b: 2 }, { a: 3 }]).items as any
    expect(items.required).toEqual(['a']) // b missing from row 2
  })

  test('null contributes to the type union, not treated as absent (#3)', () => {
    const items = inferSchema([{ v: 'x' }, { v: null }]).items as any
    expect(items.properties.v.type).toEqual(['null', 'string'])
    expect(items.required).toEqual(['v']) // present in both, just nullable
  })

  test('objects are OPEN by default — additionalProperties: true (#depends-on-5)', () => {
    const items = inferSchema([{ a: 1 }]).items as any
    expect(items.additionalProperties).toBe(true)
  })

  test('never infers constraints from observed ranges (#4)', () => {
    const items = inferSchema([{ n: 1, s: 'ab' }, { n: 9999, s: 'abcdefgh' }]).items as any
    expect(items.properties.n).toEqual({ type: 'integer' })
    expect(items.properties.s).toEqual({ type: 'string' })
    expect(JSON.stringify(inferSchema([[1], [1, 2, 3]]))).not.toContain('Items')
  })

  test('formats OFF by default; ON only when unanimous (#5)', () => {
    const off = inferSchema([{ e: 'a@b.co' }, { e: 'c@d.co' }]).items as any
    expect(off.properties.e.format).toBeUndefined()
    const on = inferSchema([{ e: 'a@b.co' }, { e: 'c@d.co' }], { formats: true }).items as any
    expect(on.properties.e.format).toBe('email')
    const mixed = inferSchema([{ e: 'a@b.co' }, { e: 'nope' }], { formats: true }).items as any
    expect(mixed.properties.e.format).toBeUndefined() // not unanimous
  })

  test('enums OFF by default; ON is threshold-based (#6)', () => {
    const off = inferSchema([{ s: 'x' }, { s: 'y' }], { enums: false }).items as any
    expect(off.properties.s.enum).toBeUndefined()
    // three distinct ids over three rows must NOT become an enum
    const ids = inferSchema([{ id: 1 }, { id: 2 }, { id: 3 }], { enums: true }).items as any
    expect(ids.properties.id.enum).toBeUndefined()
    // a genuinely repeating low-cardinality field does
    const status = inferSchema(
      [{ s: 'on' }, { s: 'off' }, { s: 'on' }, { s: 'off' }],
      { enums: true }
    ).items as any
    expect(status.properties.s.enum).toEqual(['off', 'on'])
  })

  test('a nullable enum lists null so the sample still validates (#6 + #3)', () => {
    const sample = [
      { s: 'on' }, { s: null }, { s: 'on' }, { s: 'off' }, { s: 'on' }, { s: 'off' },
    ]
    const schema = inferSchema(sample, { enums: true })
    const enumVals = (schema.items as any).properties.s.enum
    expect(enumVals).toEqual(['off', 'on', null])
    expect(validate(sample, schema)).toBeTrue() // null value still accepted
  })

  test('recurses through nested objects and arrays of objects (#7)', () => {
    const u = (inferSchema([{ u: { a: 1, b: 2 } }, { u: { a: 3 } }]).items as any)
      .properties.u
    expect(u.type).toBe('object')
    expect(u.required).toEqual(['a']) // b optional inside the nested object
  })

  test('total on degenerate input, never throws (#8)', () => {
    expect(() => inferSchema(undefined)).not.toThrow()
    // structure is minimal; the $inferred marker is opt-out for exact shape
    expect(inferSchema(undefined, { marker: false })).toEqual({})
    expect(inferSchema([], { marker: false })).toEqual({ type: 'array' })
    expect(inferSchema([null, null], { marker: false })).toEqual({
      type: 'array',
      items: { type: 'null' },
    })
  })

  test('marks inferred schemas as observed, at the root only (#6 tosijs)', () => {
    const schema = inferSchema([{ id: 1 }])
    expect(schema.$inferred).toBe(true) // observed, not authored
    expect((schema.items as any).$inferred).toBeUndefined() // root only, no nested noise
    // the marker is inert: doesn't change what validates, and agentContract
    // (which allows it through) still gates the shape
    expect(validate([{ id: 1 }], schema)).toBeTrue()
    // opt-out for a clean schema to hand-edit / promote to a declaration
    expect(inferSchema([{ id: 1 }], { marker: false }).$inferred).toBeUndefined()
  })

  test('an inferred schema can be fed straight into agentContract', () => {
    const root = inferSchema([{ qty: 1 }, { qty: 2 }]).items as any
    expect(() => agentContract({ 'app.item': root })).not.toThrow()
  })

  test('heterogeneous same-position data becomes an anyOf, not a mislabelled type (M1)', () => {
    const schema = inferSchema([{ a: 1 }, [1, 2]]).items as any
    expect(schema.anyOf).toBeDefined()
    expect(schema.anyOf.map((b: any) => b.type).sort()).toEqual(['array', 'object'])
    expect(validate([{ a: 1 }, [1, 2]], inferSchema([{ a: 1 }, [1, 2]]))).toBeTrue()
  })

  test('inferSchema(sample, {formats:true}) always feeds agentContract (M2)', () => {
    // only formats validate enforces are emitted, so the gate never rejects them
    for (const sample of [
      [{ d: '2020-01-01' }, { d: '2021-06-15' }],
      [{ e: 'a@b.co' }, { e: 'c@d.co' }],
      [{ u: 'https://a.co' }, { u: 'http://b.co/x' }],
    ]) {
      const root = inferSchema(sample, { formats: true }).items as any
      expect(() => agentContract({ 'app.x': root })).not.toThrow()
    }
  })

  test('a sniffed format is a subset of the enforcer — never rejects its own sample (M3)', () => {
    // uri near-misses the loose regex used to accept but new URL() rejects
    for (const bad of ['http://', 'http:// x', 'http://[', 'http://%zz']) {
      const sample = [{ u: bad }]
      expect(validate(sample, inferSchema(sample, { formats: true }))).toBeTrue()
    }
    // a genuinely valid uri still gets the format
    expect(
      (inferSchema([{ u: 'https://example.com' }], { formats: true }).items as any)
        .properties.u.format
    ).toBe('uri')
  })

  test('deterministic: same data, byte-identical output regardless of key order (#9)', () => {
    const a = JSON.stringify(inferSchema([{ b: 1, a: 2, c: 3 }]))
    const b = JSON.stringify(inferSchema([{ c: 3, a: 2, b: 1 }]))
    expect(a).toBe(b)
  })

  test('output is plain editable JSON Schema (#10)', () => {
    const schema = inferSchema([{ id: 1 }])
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema)
  })

  test('surfaces sampleSize truncation, never silent (#11)', () => {
    const notes: any[] = []
    inferSchema([1, 2, 3, 4, 5], { sampleSize: 2, onTruncate: (i) => notes.push(i) })
    expect(notes).toEqual([{ path: '(root)', sampled: 2, total: 5 }])
    // truncation of a NESTED array reports its path, not (root)
    const nested: any[] = []
    inferSchema([{ tags: [1, 2, 3, 4] }], { sampleSize: 2, onTruncate: (i) => nested.push(i) })
    expect(nested).toEqual([{ path: '[].tags', sampled: 2, total: 4 }])
    // no truncation → no note
    const none: any[] = []
    inferSchema([1, 2], { sampleSize: 5, onTruncate: (i) => none.push(i) })
    expect(none).toEqual([])
  })

  test('enums: numeric fields sort numerically; object config tunes thresholds', () => {
    // a repeating low-cardinality numeric field → numerically-sorted enum
    const codes = inferSchema(
      [{ c: 200 }, { c: 404 }, { c: 200 }, { c: 500 }, { c: 404 }, { c: 200 }],
      { enums: true }
    ).items as any
    expect(codes.properties.c.enum).toEqual([200, 404, 500])
    // object config: a stricter maxDistinct suppresses it
    const loose = inferSchema(
      [{ c: 200 }, { c: 404 }, { c: 200 }, { c: 500 }, { c: 404 }, { c: 200 }],
      { enums: { maxDistinct: 2 } }
    ).items as any
    expect(loose.properties.c.enum).toBeUndefined() // 3 distinct > maxDistinct 2
  })

  test('integer vs number distinction is preserved and unified', () => {
    expect((inferSchema([1, 2, 3]) as any).items).toEqual({ type: 'integer' })
    expect((inferSchema([1, 2.5]) as any).items.type).toEqual(['integer', 'number'])
  })
})
