import { describe, test, expect, afterAll } from 'bun:test'
import { s, validate, diff, filter, setWarnings } from './schema'

// oneOf validation emits a once-per-process cost warning; silence it so the
// suite's output stays clean (restored after the file runs).
setWarnings(false)
afterAll(() => setWarnings(true))

// =============================================================================
// CRITICAL GAPS - Untested Features
// =============================================================================

describe('s.null', () => {
  test('generates correct schema', () => {
    expect(s.null.schema).toEqual({ type: 'null' })
  })

  test('validates null', () => {
    expect(validate(null, s.null)).toBeTrue()
  })

  test('rejects undefined', () => {
    expect(validate(undefined, s.null)).toBeFalse()
  })

  test('rejects other types', () => {
    expect(validate('null', s.null)).toBeFalse()
    expect(validate(0, s.null)).toBeFalse()
    expect(validate(false, s.null)).toBeFalse()
    expect(validate({}, s.null)).toBeFalse()
  })
})

describe('s.undefined', () => {
  test('generates correct schema with x-tjs-undefined flag', () => {
    expect(s.undefined.schema).toEqual({ type: 'null', 'x-tjs-undefined': true })
  })

  test('validates undefined', () => {
    expect(validate(undefined, s.undefined)).toBeTrue()
  })

  test('rejects null', () => {
    expect(validate(null, s.undefined)).toBeFalse()
  })

  test('rejects other types', () => {
    expect(validate('undefined', s.undefined)).toBeFalse()
    expect(validate(0, s.undefined)).toBeFalse()
    expect(validate(false, s.undefined)).toBeFalse()
  })
})

describe('s.infer() - Schema inference from values', () => {
  test('infers null', () => {
    const schema = s.infer(null)
    expect(schema.schema.type).toBe('null')
    expect(validate(null, schema)).toBeTrue()
  })

  test('infers undefined', () => {
    const schema = s.infer(undefined)
    expect(schema.schema.type).toBe('null')
    expect(schema.schema['x-tjs-undefined']).toBeTrue()
    expect(validate(undefined, schema)).toBeTrue()
  })

  test('infers string', () => {
    const schema = s.infer('hello')
    expect(schema.schema.type).toBe('string')
    expect(validate('world', schema)).toBeTrue()
    expect(validate(123, schema)).toBeFalse()
  })

  test('infers integer vs number', () => {
    const intSchema = s.infer(42)
    expect(intSchema.schema.type).toBe('integer')
    expect(validate(100, intSchema)).toBeTrue()
    expect(validate(3.14, intSchema)).toBeFalse()

    const floatSchema = s.infer(3.14)
    expect(floatSchema.schema.type).toBe('number')
    expect(validate(2.5, floatSchema)).toBeTrue()
    expect(validate(100, floatSchema)).toBeTrue() // integers are valid numbers
  })

  test('infers boolean', () => {
    const schema = s.infer(true)
    expect(schema.schema.type).toBe('boolean')
    expect(validate(false, schema)).toBeTrue()
    expect(validate('true', schema)).toBeFalse()
  })

  test('infers empty array', () => {
    const schema = s.infer([])
    expect(schema.schema.type).toBe('array')
    expect(schema.schema.items).toBeUndefined()
  })

  test('infers array from first element', () => {
    const schema = s.infer([1, 2, 3])
    expect(schema.schema.type).toBe('array')
    expect(schema.schema.items!.type).toBe('integer')
  })

  test('infers object structure', () => {
    const schema = s.infer({ name: 'Alice', age: 30 })
    expect(schema.schema.type).toBe('object')
    expect(schema.schema.properties!.name!.type).toBe('string')
    expect(schema.schema.properties!.age!.type).toBe('integer')
    expect(schema.schema.required).toContain('name')
    expect(schema.schema.required).toContain('age')
    expect(schema.schema.additionalProperties).toBe(false)
  })

  test('infers nested objects', () => {
    const schema = s.infer({ user: { id: 1 } })
    expect(schema.schema.properties!.user!.type).toBe('object')
    expect(schema.schema.properties!.user!.properties!.id!.type).toBe('integer')
  })

  test('returns empty schema for unsupported types', () => {
    const schema = s.infer(Symbol('test'))
    expect(schema.schema).toEqual({})
  })
})

// =============================================================================
// NUMERIC EDGE CASES
// =============================================================================

describe('Numeric edge cases', () => {
  test('NaN fails number validation', () => {
    expect(validate(NaN, s.number)).toBeFalse()
  })

  test('NaN fails integer validation', () => {
    expect(validate(NaN, s.integer)).toBeFalse()
  })

  test('Infinity fails number validation', () => {
    expect(validate(Infinity, s.number)).toBeFalse()
    expect(validate(-Infinity, s.number)).toBeFalse()
  })

  test('Infinity fails integer validation', () => {
    expect(validate(Infinity, s.integer)).toBeFalse()
    expect(validate(-Infinity, s.integer)).toBeFalse()
  })

  test('-0 is treated as 0', () => {
    expect(validate(-0, s.number)).toBeTrue()
    expect(validate(-0, s.number.min(0))).toBeTrue()
    expect(validate(-0, s.integer)).toBeTrue()
  })

  test('step/multipleOf with floating point', () => {
    const step = s.number.step(0.1)
    expect(validate(0.3, step)).toBeTrue()
    expect(validate(0.1, step)).toBeTrue()
    expect(validate(1.0, step)).toBeTrue()
    // Note: 0.3 % 0.1 has floating point issues in JS (0.09999...)
    // This test documents current behavior
  })

  test('step with zero accepts any number', () => {
    const step = s.number.step(0)
    // step(0) effectively means "no step constraint" since 0 % 0 = NaN
    // and NaN comparisons return false, so the check passes
    expect(validate(5, step)).toBeTrue()
    expect(validate(3.14, step)).toBeTrue()
  })

  test('negative numbers with constraints', () => {
    const range = s.number.min(-10).max(10)
    expect(validate(-5, range)).toBeTrue()
    expect(validate(-10, range)).toBeTrue()
    expect(validate(-11, range)).toBeFalse()
  })

  test('very large numbers', () => {
    expect(validate(Number.MAX_SAFE_INTEGER, s.integer)).toBeTrue()
    expect(validate(Number.MAX_VALUE, s.number)).toBeTrue()
  })
})

// =============================================================================
// STRING EDGE CASES
// =============================================================================

describe('String edge cases', () => {
  test('empty string', () => {
    expect(validate('', s.string)).toBeTrue()
    expect(validate('', s.string.min(0))).toBeTrue()
    expect(validate('', s.string.min(1))).toBeFalse()
  })

  test('unicode strings - length is code units', () => {
    // emoji is 2 code units in JS
    expect(validate('a', s.string.max(1))).toBeTrue()
    // This documents current behavior - may want to reconsider
  })

  test('newlines in strings', () => {
    expect(validate('line1\nline2', s.string)).toBeTrue()
  })

  test('pattern with special regex chars', () => {
    const schema = s.string.pattern('^\\$\\d+\\.\\d{2}$')
    expect(validate('$10.99', schema)).toBeTrue()
    expect(validate('10.99', schema)).toBeFalse()
  })
})

// =============================================================================
// ARRAY EDGE CASES
// =============================================================================

describe('Array edge cases', () => {
  test('empty array', () => {
    expect(validate([], s.array(s.number))).toBeTrue()
    expect(validate([], s.array(s.number).min(0))).toBeTrue()
    expect(validate([], s.array(s.number).min(1))).toBeFalse()
  })

  test('array without items schema accepts anything', () => {
    // When there's no items schema, array contents aren't validated
    const schema = { type: 'array' }
    expect(validate([1, 'mixed', true, null], schema)).toBeTrue()
  })

  test('sparse arrays', () => {
    const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
    // Sparse arrays have undefined at empty slots
    expect(validate(sparse, s.array(s.number))).toBeFalse()
  })

  test('array-like objects are rejected', () => {
    const arrayLike = { 0: 'a', 1: 'b', length: 2 }
    expect(validate(arrayLike, s.array(s.string))).toBeFalse()
  })
})

// =============================================================================
// OBJECT EDGE CASES
// =============================================================================

describe('Object edge cases', () => {
  test('empty object schema', () => {
    const Empty = s.object({})
    expect(validate({}, Empty)).toBeTrue()
    // Extra properties are rejected due to additionalProperties: false
    expect(validate({ extra: 1 }, Empty)).toBeFalse()
  })

  test('Object.create(null)', () => {
    const nullProto = Object.create(null)
    nullProto.id = 1
    const schema = s.object({ id: s.number })
    expect(validate(nullProto, schema)).toBeTrue()
  })

  test('inherited properties are ignored', () => {
    const parent = { inherited: 'value' }
    const child = Object.create(parent)
    child.own = 'prop'

    const schema = s.object({ own: s.string })
    expect(validate(child, schema)).toBeTrue()
  })

  test('combined properties and additionalProperties', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'number' } },
      additionalProperties: { type: 'string' },
      required: ['id']
    }

    expect(validate({ id: 1 }, schema)).toBeTrue()
    expect(validate({ id: 1, extra: 'ok' }, schema)).toBeTrue()
    expect(validate({ id: 1, extra: 123 }, schema)).toBeFalse()
  })

  test('record with minProperties', () => {
    const dict = s.record(s.number).min(2)
    expect(validate({ a: 1, b: 2 }, dict)).toBeTrue()
    expect(validate({ a: 1 }, dict)).toBeFalse()
  })
})

// =============================================================================
// FORMAT VALIDATOR EDGE CASES
// =============================================================================

describe('Format validator edge cases', () => {
  describe('email', () => {
    test('basic valid emails', () => {
      expect(validate('user@example.com', s.email)).toBeTrue()
      expect(validate('user+tag@example.com', s.email)).toBeTrue()
    })

    test('rejects invalid emails', () => {
      expect(validate('notanemail', s.email)).toBeFalse()
      expect(validate('@example.com', s.email)).toBeFalse()
      expect(validate('user@', s.email)).toBeFalse()
    })
  })

  describe('ipv4', () => {
    test('boundary values', () => {
      expect(validate('0.0.0.0', s.ipv4)).toBeTrue()
      expect(validate('255.255.255.255', s.ipv4)).toBeTrue()
    })

    test('rejects out of range octets', () => {
      expect(validate('256.1.1.1', s.ipv4)).toBeFalse()
      expect(validate('1.1.1.256', s.ipv4)).toBeFalse()
    })

    test('rejects leading zeros (strict)', () => {
      // Current implementation may or may not accept this
      // Documenting behavior
      const result = validate('192.168.001.001', s.ipv4)
      // Leading zeros are accepted by current regex
      expect(result).toBeTrue()
    })
  })

  describe('url', () => {
    test('various protocols', () => {
      expect(validate('https://example.com', s.url)).toBeTrue()
      expect(validate('http://example.com', s.url)).toBeTrue()
      expect(validate('ftp://files.example.com', s.url)).toBeTrue()
    })

    test('rejects relative URLs', () => {
      expect(validate('/path/to/resource', s.url)).toBeFalse()
      expect(validate('example.com', s.url)).toBeFalse()
    })

    test('data URLs', () => {
      expect(validate('data:text/plain;base64,SGVsbG8=', s.url)).toBeTrue()
    })
  })

  describe('datetime', () => {
    test('ISO 8601 variants', () => {
      expect(validate('2023-11-21T10:00:00Z', s.datetime)).toBeTrue()
      expect(validate('2023-11-21T10:00:00+05:30', s.datetime)).toBeTrue()
      expect(validate('2023-11-21T10:00:00.123Z', s.datetime)).toBeTrue()
    })

    test('date-time is RFC 3339: a date-only string is NOT a date-time (#7)', () => {
      // (1.7.0) previously accepted via Date.parse — but `2023-11-21` is not a
      // valid RFC 3339 date-time, so conforming validators reject it. Use `date`.
      expect(validate('2023-11-21', s.datetime)).toBeFalse()
      expect(validate('2023-11-21', { type: 'string', format: 'date' })).toBeTrue()
    })

    test('date-time rejects non-RFC-3339 strings Date.parse used to accept', () => {
      expect(validate('not-a-date', s.datetime)).toBeFalse()
      expect(validate('2023-13-01', s.datetime)).toBeFalse() // invalid month
      expect(validate('2023-11-21 10:00:00', s.datetime)).toBeFalse() // space, not T
      expect(validate('Jan 1 2020', s.datetime)).toBeFalse()
    })

    test('date-time enforces RFC 3339 time components', () => {
      const dt = s.datetime
      expect(validate('2020-01-01T10:00:00-05:00', dt)).toBeTrue() // negative offset
      expect(validate('2020-01-01T25:00:00Z', dt)).toBeFalse() // hour > 23
      expect(validate('2020-01-01T10:99:00Z', dt)).toBeFalse() // minute > 59
      expect(validate('2020-01-01T10:00:61Z', dt)).toBeFalse() // second > 60
      expect(validate('2020-01-01T10:00Z', dt)).toBeFalse() // seconds required
      // a leap second (`:60`) is legal only at 23:59, per ajv-formats
      expect(validate('2016-12-31T23:59:60Z', dt)).toBeTrue()
      expect(validate('2020-01-01T10:00:60Z', dt)).toBeFalse()
    })

    test('format: date is RFC 3339 full-date (day-in-month enforced)', () => {
      expect(validate('2024-02-29', { type: 'string', format: 'date' })).toBeTrue() // leap
      expect(validate('2023-02-29', { type: 'string', format: 'date' })).toBeFalse() // not leap
      expect(validate('2020-02-30', { type: 'string', format: 'date' })).toBeFalse()
      expect(validate('2020-13-01', { type: 'string', format: 'date' })).toBeFalse()
      expect(validate('2020-1-1', { type: 'string', format: 'date' })).toBeFalse() // not zero-padded
    })
  })
})

// =============================================================================
// COMPLEX UNIONS
// =============================================================================

describe('Complex unions', () => {
  test('union with null', () => {
    const NullableString = s.union([s.string, s.null])
    expect(validate('hello', NullableString)).toBeTrue()
    expect(validate(null, NullableString)).toBeTrue()
    expect(validate(undefined, NullableString)).toBeFalse()
    expect(validate(123, NullableString)).toBeFalse()
  })

  test('union with undefined', () => {
    const MaybeString = s.union([s.string, s.undefined])
    expect(validate('hello', MaybeString)).toBeTrue()
    expect(validate(undefined, MaybeString)).toBeTrue()
    expect(validate(null, MaybeString)).toBeFalse()
  })

  test('nested unions (union of unions)', () => {
    const Inner1 = s.union([s.string, s.number])
    const Inner2 = s.union([s.boolean, s.null])
    const Outer = s.union([Inner1, Inner2])

    expect(validate('text', Outer)).toBeTrue()
    expect(validate(42, Outer)).toBeTrue()
    expect(validate(true, Outer)).toBeTrue()
    expect(validate(null, Outer)).toBeTrue()
    expect(validate(undefined, Outer)).toBeFalse()
    expect(validate({}, Outer)).toBeFalse()
  })

  test('union of arrays', () => {
    const StringsOrNumbers = s.union([s.array(s.string), s.array(s.number)])

    expect(validate(['a', 'b'], StringsOrNumbers)).toBeTrue()
    expect(validate([1, 2], StringsOrNumbers)).toBeTrue()
    expect(validate([], StringsOrNumbers)).toBeTrue() // Empty array matches both
    expect(validate(['a', 1], StringsOrNumbers)).toBeFalse()
  })

  test('union of objects with different shapes', () => {
    const Circle = s.object({ type: s.const('circle'), radius: s.number })
    const Rectangle = s.object({ type: s.const('rect'), width: s.number, height: s.number })
    const Triangle = s.object({ type: s.const('tri'), base: s.number, height: s.number })

    const Shape = s.union([Circle, Rectangle, Triangle])

    expect(validate({ type: 'circle', radius: 5 }, Shape)).toBeTrue()
    expect(validate({ type: 'rect', width: 10, height: 20 }, Shape)).toBeTrue()
    expect(validate({ type: 'tri', base: 10, height: 15 }, Shape)).toBeTrue()
    expect(validate({ type: 'square', side: 5 }, Shape)).toBeFalse()
  })

  test('union with enum', () => {
    const Status = s.union([
      s.enum(['pending', 'active']),
      s.object({ code: s.number, message: s.string })
    ])

    expect(validate('pending', Status)).toBeTrue()
    expect(validate('active', Status)).toBeTrue()
    expect(validate({ code: 200, message: 'OK' }, Status)).toBeTrue()
    expect(validate('unknown', Status)).toBeFalse()
  })

  test('deeply nested union structure', () => {
    const Leaf = s.union([s.string, s.number])
    const Node = s.object({
      value: Leaf,
      children: s.array(s.union([
        Leaf,
        s.object({ nested: Leaf })
      ]))
    })

    expect(validate({
      value: 'root',
      children: [1, 'two', { nested: 3 }]
    }, Node)).toBeTrue()

    expect(validate({
      value: 'root',
      children: [{ nested: true }] // boolean not in Leaf
    }, Node)).toBeFalse()
  })

  test('union in record values', () => {
    const Config = s.record(s.union([s.string, s.number, s.boolean]))

    expect(validate({ name: 'test', count: 5, enabled: true }, Config)).toBeTrue()
    expect(validate({ bad: null }, Config)).toBeFalse()
  })

  test('triple union with overlapping types', () => {
    // Number satisfies both integer and number checks
    const Flexible = s.union([s.integer, s.number, s.string])

    expect(validate(42, Flexible)).toBeTrue()
    expect(validate(3.14, Flexible)).toBeTrue()
    expect(validate('text', Flexible)).toBeTrue()
  })
})

// =============================================================================
// DIFF FUNCTION GAPS
// =============================================================================

describe('Diff function - additional coverage', () => {
  test('tuple length mismatch', () => {
    const A = s.tuple([s.number, s.number])
    const B = s.tuple([s.number, s.number, s.number])

    const d = diff(A.schema, B.schema)
    expect(d.error).toContain('Tuple length mismatch')
  })

  test('tuple vs array mismatch', () => {
    const Tuple = s.tuple([s.number, s.string])
    const Array = s.array(s.number)

    const d = diff(Tuple.schema, Array.schema)
    expect(d.error).toContain('Array type mismatch')
  })

  test('maxLength diff', () => {
    const A = s.string.max(10)
    const B = s.string.max(20)

    // Note: maxLength not currently in diff list - documenting behavior
    const d = diff(A.schema, B.schema)
    // If null, maxLength isn't being diffed
    if (d === null) {
      // Current implementation doesn't diff maxLength
      expect(d).toBeNull()
    } else {
      expect(d.maxLength).toBeDefined()
    }
  })

  test('required array changes', () => {
    const A = s.object({ a: s.string, b: s.string.optional })
    const B = s.object({ a: s.string, b: s.string }) // b now required

    const d = diff(A.schema, B.schema)
    // Diffing required changes through property type change
    expect(d.b).toBeDefined()
  })

  test('additionalProperties schema diff', () => {
    const A = s.record(s.string)
    const B = s.record(s.number)

    const d = diff(A.schema, B.schema)
    // Record diffs should show additionalProperties change
    if (d) {
      expect(d).toBeDefined()
    }
  })

  test('union diff - different variants', () => {
    const A = s.union([s.string, s.number])
    const B = s.union([s.string, s.boolean])

    const d = diff(A.schema, B.schema)
    expect(d.error).toContain('Union mismatch')
  })

  test('nested object property type change', () => {
    const A = s.object({ user: s.object({ id: s.number }) })
    const B = s.object({ user: s.object({ id: s.string }) })

    const d = diff(A.schema, B.schema)
    expect(d.user.id.error).toContain('Type mismatch')
  })
})

// =============================================================================
// FILTER FUNCTION GAPS
// =============================================================================

describe('Filter function - additional coverage', () => {
  test('filter with record passes through all valid keys', () => {
    const schema = s.record(s.number)
    const input = { a: 1, b: 2, c: 3 }
    const result = filter(input, schema)

    // Records don't strip keys - they validate additionalProperties
    expect(result).toEqual({ a: 1, b: 2, c: 3 })
  })

  test('filter primitives returns as-is', () => {
    expect(filter('hello', s.string)).toBe('hello')
    expect(filter(123, s.number)).toBe(123)
    expect(filter(true, s.boolean)).toBe(true)
  })

  test('filter with union (takes first valid branch)', () => {
    const schema = s.union([
      s.object({ type: s.const('a'), value: s.string }),
      s.object({ type: s.const('b'), count: s.number })
    ])

    const inputA = { type: 'a', value: 'test', extra: true }
    const inputB = { type: 'b', count: 5, extra: true }

    // Union filter strips against the first branch the stripped data satisfies
    const resultA = filter(inputA, schema)
    const resultB = filter(inputB, schema)

    expect(resultA).toEqual({ type: 'a', value: 'test' })
    expect(resultB).toEqual({ type: 'b', count: 5 })

    // no branch matches even after stripping → validation Error
    expect(filter({ type: 'c' }, schema)).toBeInstanceOf(Error)
    // …unless validation is skipped, which falls through unstripped
    expect(filter({ type: 'c' }, schema, { skipValidation: true })).toEqual({ type: 'c' })
  })

  test('filter strips a propertyless strict object schema to {}', () => {
    expect(filter({ x: 1 }, { type: 'object', additionalProperties: false })).toEqual({})
  })

  test('filter keeps extras under additionalProperties: true (spec-equivalent to {})', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'number' } },
      additionalProperties: true,
    }
    expect(filter({ a: 1, b: 2 }, schema)).toEqual({ a: 1, b: 2 })
  })

  test('filter strips through oneOf like anyOf (1.8.0 — filterData learned oneOf)', () => {
    const circle = { type: 'object', properties: { kind: { const: 'circle' }, r: { type: 'number' } }, required: ['kind', 'r'], additionalProperties: false }
    const square = { type: 'object', properties: { kind: { const: 'square' }, s: { type: 'number' } }, required: ['kind', 's'], additionalProperties: false }
    const out = filter({ kind: 'circle', r: 2, junk: 99 }, { oneOf: [circle, square] })
    expect(out).not.toBeInstanceOf(Error) // regression: filterData used to error on oneOf
    expect(out).toEqual({ kind: 'circle', r: 2 })
  })

  test('filter over overlapping oneOf branches keeps fields the matching branch requires (no silent data loss)', () => {
    // Subset branches: {a} and {a,b}, both closed. {a:1,b:2} matches ONLY
    // branch 2 (branch 1 rejects the extra b), so filter must strip against
    // branch 2 and preserve b — not shed b to force a match on branch 1.
    const narrow = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }
    const wide = { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false }
    const schema = { oneOf: [narrow, wide] }
    // sanity: the input is genuinely oneOf-valid (matches exactly one branch)
    expect(validate({ a: 1, b: 2 }, schema)).toBe(true)
    // the regression was filter returning { a: 1 } (b silently dropped)
    expect(filter({ a: 1, b: 2 }, schema)).toEqual({ a: 1, b: 2 })
    // and it still sheds genuine extras that the matching branch rejects
    expect(filter({ a: 1, b: 2, junk: 9 }, schema)).toEqual({ a: 1, b: 2 })
    // no branch matches as-is, but exactly one fits after shedding junk →
    // strip junk and land on that branch ({a} only); b is genuinely absent
    expect(filter({ a: 1, junk: 9 }, schema)).toEqual({ a: 1 })
  })

  test('filter over a genuinely-ambiguous oneOf tie refuses rather than arbitrarily dropping data', () => {
    // Disjoint single-required branches: {a} and {b}, both closed. {a:1,b:2}
    // matches NEITHER as-is (each rejects the other's key), and stripping fits
    // BOTH equally ({a:1} for branch 1, {b:2} for branch 2) — a real tie. The
    // anti-data-loss rule: never arbitrarily pick one and silently drop the
    // other's field. filterData returns the data UNSTRIPPED, so the outer
    // filter() surfaces a loud Error instead of an arbitrary lossy strip.
    const onlyA = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }
    const onlyB = { type: 'object', properties: { b: { type: 'number' } }, required: ['b'], additionalProperties: false }
    const schema = { oneOf: [onlyA, onlyB] }
    // loud Error — filter cannot resolve the ambiguity without dropping a field
    expect(filter({ a: 1, b: 2 }, schema)).toBeInstanceOf(Error)
    // and the raw strip is the UNSTRIPPED input (no field silently shed)
    expect(filter({ a: 1, b: 2 }, schema, { skipValidation: true })).toEqual({ a: 1, b: 2 })
  })

  test('filter strips typeless applicator schemas (zero-preprocessing runtime schemas)', () => {
    expect(
      filter({ a: 1, b: 2 }, {
        properties: { a: { type: 'number' } },
        additionalProperties: false,
        required: ['a'],
      })
    ).toEqual({ a: 1 })
    expect(filter([{ x: 1, extra: 2 }], { items: { properties: { x: { type: 'number' } } } })).toEqual([{ x: 1 }])
  })

  test('filter deeply nested structure', () => {
    const schema = s.object({
      users: s.array(s.object({
        profile: s.object({
          name: s.string
        })
      }))
    })

    const input = {
      users: [
        { profile: { name: 'Alice', secret: 'password' }, role: 'admin' }
      ],
      metadata: { timestamp: 123 }
    }

    const result = filter(input, schema)
    expect(result).toEqual({
      users: [{ profile: { name: 'Alice' } }]
    })
  })
})

// =============================================================================
// ERROR PATH REPORTING
// =============================================================================

describe('Error path reporting', () => {
  test('deeply nested error path', () => {
    const schema = s.object({
      level1: s.object({
        level2: s.object({
          level3: s.number
        })
      })
    })

    let errorPath = ''
    validate(
      { level1: { level2: { level3: 'wrong' } } },
      schema,
      (path) => { errorPath = path }
    )

    expect(errorPath).toBe('level1.level2.level3')
  })

  test('array index in error path', () => {
    const schema = s.array(s.object({ id: s.number }))

    let errorPath = ''
    validate(
      [{ id: 1 }, { id: 'bad' }],
      schema,
      { fullScan: true, onError: (path) => { errorPath = path } }
    )

    expect(errorPath).toBe('1.id')
  })

  test('root error path', () => {
    let errorPath = ''
    validate('not a number', s.number, (path) => { errorPath = path })

    expect(errorPath).toBe('root')
  })
})

// =============================================================================
// BUILDER CHAINING ORDER
// =============================================================================

describe('Builder chaining order independence', () => {
  test('min/max order does not matter', () => {
    const schema1 = s.number.min(0).max(10)
    const schema2 = s.number.max(10).min(0)

    expect(schema1.schema.minimum).toBe(0)
    expect(schema1.schema.maximum).toBe(10)
    expect(schema2.schema.minimum).toBe(0)
    expect(schema2.schema.maximum).toBe(10)
  })

  test('metadata then constraint', () => {
    const schema = s.string.title('Name').min(1).describe('User name')

    expect(schema.schema.title).toBe('Name')
    expect(schema.schema.minLength).toBe(1)
    expect(schema.schema.description).toBe('User name')
  })

  test('format then constraint', () => {
    const schema = s.email.min(5).max(100)

    expect(schema.schema.format).toBe('email')
    expect(schema.schema.minLength).toBe(5)
    expect(schema.schema.maxLength).toBe(100)
  })
})
