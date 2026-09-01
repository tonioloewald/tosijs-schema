import { describe, test, expect, afterAll } from 'bun:test'
import {
  s,
  validate,
  diff,
  filter,
  setPredicateEvaluator,
  setWarnings,
  ENFORCED_KEYWORDS,
  type Infer,
} from './schema'

// oneOf emits a one-time cost warning; keep it out of test output except where
// a test explicitly asserts it.
setWarnings(false)
afterAll(() => setWarnings(true))

// --- 1. BUILDER STRUCTURE CHECKS ---
describe('Builder Output', () => {
  test('generates correct JSON Schema structure', () => {
    const schema = s.object({
      name: s.string,
      age: s.number.min(18),
    })

    expect(schema.schema.type).toBe('object')
    expect(schema.schema.properties!.age!.minimum).toBe(18)
    expect(schema.schema.required).toContain('name')
    expect(schema.schema.additionalProperties).toBe(false)
  })

  test('open objects: named fields + additionalProperties: true (#5)', () => {
    // the tjs-lang protocol case: a chat message whose provider adds fields
    const Message = s
      .object({ role: s.string.optional, content: s.string.optional })
      .open
    expect(Message.schema.additionalProperties).toBe(true)
    // keeps properties/required — not the s.record(s.any) "it's an object" loss
    expect(Message.schema.properties).toHaveProperty('role')
    const msg = { role: 'assistant', content: 'hi', reasoning_content: 'x' }
    expect(validate(msg, Message)).toBeTrue() // unknown field admitted
    expect(validate({ role: 42 }, Message)).toBeFalse() // declared type still enforced
    // the options form is equivalent
    const viaOpts = s.object({ role: s.string }, { additionalProperties: true })
    expect(viaOpts.schema.additionalProperties).toBe(true)
    expect(validate({ role: 'x', extra: 1 }, viaOpts)).toBeTrue()
    // default is still closed
    expect(validate({ role: 'x', extra: 1 }, s.object({ role: s.string }))).toBeFalse()
  })

  test('handles nested array schemas', () => {
    const schema = s.array(s.string)
    expect(schema.schema.type).toBe('array')
    expect(schema.schema.items!.type).toBe('string')
  })
})

// --- 2. VALIDATION LOGIC ---
describe('Validation: Primitives', () => {
  test('validates Booleans', () => {
    const schema = s.boolean
    expect(validate(true, schema.schema)).toBeTrue()
    expect(validate(false, schema.schema)).toBeTrue()
    expect(validate('true', schema.schema)).toBeFalse()
    expect(validate(0, schema.schema)).toBeFalse()
  })

  test('validates Numbers (Range, Int, Step)', () => {
    const Rating = s.number.min(1).max(5)
    expect(validate(3, Rating.schema)).toBeTrue()
    expect(validate(0, Rating.schema)).toBeFalse()
    expect(validate(6, Rating.schema)).toBeFalse()

    const Int = s.integer
    expect(validate(5, Int.schema)).toBeTrue()
    expect(validate(5.5, Int.schema)).toBeFalse()

    const Step = s.number.step(0.5)
    expect(validate(1.5, Step.schema)).toBeTrue()
    expect(validate(1.3, Step.schema)).toBeFalse()
  })

  test('validates String Patterns (Regex)', () => {
    const schema = s.string.pattern('^user_\\d{3}$')
    expect(validate('user_123', schema.schema)).toBeTrue()
    expect(validate('user_abc', schema.schema)).toBeFalse()
  })

  test('pattern compilation is cached without changing semantics', () => {
    const schema = { type: 'string', pattern: '^\\d+$' }
    // repeated validations (would each hit the cache) stay correct
    for (let i = 0; i < 3; i++) {
      expect(validate('123', schema)).toBeTrue()
      expect(validate('12a', schema)).toBeFalse()
    }
    // the emoji `u`-flag variant is a distinct cache key, not a collision
    const emoji = { type: 'string', pattern: '^\\p{Extended_Pictographic}+$', format: 'emoji' }
    expect(validate('😀', emoji)).toBeTrue()
    expect(validate('x', emoji)).toBeFalse()
    // an invalid pattern still fails closed (never cached, never throws)
    expect(validate('anything', { type: 'string', pattern: '[' })).toBeFalse()
    expect(validate('anything', { type: 'string', pattern: '[' })).toBeFalse()
  })
})

describe('Validation: String Formats', () => {
  test('validates Standard Formats', () => {
    expect(validate('test@example.com', s.string.email.schema)).toBeTrue()
    expect(validate('not-email', s.string.email.schema)).toBeFalse()

    expect(
      validate('123e4567-e89b-12d3-a456-426614174000', s.string.uuid.schema)
    ).toBeTrue()
    expect(validate('123-456', s.string.uuid.schema)).toBeFalse()

    expect(validate('192.168.1.1', s.string.ipv4.schema)).toBeTrue()
    expect(validate('999.999.999.999', s.string.ipv4.schema)).toBeFalse()

    // s.date / s.string.date — the fluent form of the 1.7.0 migration remedy
    expect(s.date.schema).toEqual({ type: 'string', format: 'date' })
    expect(s.string.date.schema).toEqual({ type: 'string', format: 'date' })
    expect(validate('2020-01-01', s.date.schema)).toBeTrue()
    expect(validate('2020-13-01', s.date.schema)).toBeFalse()

    expect(validate('https://google.com', s.string.url.schema)).toBeTrue()
    expect(validate('google.com', s.string.url.schema)).toBeFalse()

    expect(
      validate('2023-11-21T10:00:00Z', s.string.datetime.schema)
    ).toBeTrue()
    expect(validate('Hello World', s.string.datetime.schema)).toBeFalse()
  })

  test('validates Emoji (Strict)', () => {
    const schema = s.string.emoji
    expect(validate('🔥', schema.schema)).toBeTrue()
    expect(validate('🚀👍', schema.schema)).toBeTrue()
    expect(validate('Hello 🚀', schema.schema)).toBeFalse() // Mixed content (end)
    expect(validate('🔥 fire', schema.schema)).toBeFalse() // Mixed content (start)
    expect(validate('Text only', schema.schema)).toBeFalse()
  })
})

describe('Validation: Complex Types', () => {
  test('validates Objects', () => {
    const User = s.object({
      id: s.number,
      email: s.string,
    })

    expect(validate({ id: 1, email: 'test' }, User.schema)).toBeTrue()
    expect(validate({ id: '1', email: 'test' }, User.schema)).toBeFalse()
    expect(validate({ id: 1 }, User.schema)).toBeFalse()
    expect(validate(null, User.schema)).toBeFalse()
  })

  test('validate accepts Builder directly', () => {
    const User = s.object({
      id: s.number,
      email: s.string,
    })

    // Passing the builder object 'User' instead of 'User.schema'
    expect(validate({ id: 1, email: 'test' }, User)).toBeTrue()
    expect(validate({ id: '1', email: 'test' }, User)).toBeFalse()

    // Method style
    expect(User.validate({ id: 1, email: 'test' })).toBeTrue()
    expect(User.validate({ id: '1', email: 'test' })).toBeFalse()
  })

  test('validates Optional Fields', () => {
    const schema = s.string.optional
    expect(validate('hello', schema.schema)).toBeTrue()
    expect(validate(null, schema.schema)).toBeTrue()
    expect(validate(undefined, schema.schema)).toBeTrue()
    expect(validate(123, schema.schema)).toBeFalse()
  })

  test('validates Array constraints (Polymorphic .min)', () => {
    // The builder uses .min() for numbers, but .minItems for arrays.
    const List = s.array(s.number).min(2)
    expect(validate([1, 2], List.schema)).toBeTrue()
    expect(validate([1], List.schema)).toBeFalse()
  })
})

// --- 3. OBJECT CONSTRAINTS & OPTIMIZATION ---
describe('Object Constraints & Optimization', () => {
  test('minProperties: Validates minimum key count', () => {
    const dict = s.record(s.number).min(2)

    expect(validate({ a: 1, b: 2 }, dict.schema)).toBeTrue()
    expect(validate({ a: 1 }, dict.schema)).toBeFalse()
    expect(validate({}, dict.schema)).toBeFalse()
  })

  test('maxProperties: enforced in EVERY mode as of v1.9.0 (short-circuits, no full scan needed)', () => {
    const dict = s.record(s.number).max(1)

    // still emitted into the schema (docs/OpenAPI)
    expect(dict.schema.maxProperties).toBe(1)

    // default mode now ENFORCES it — this returned true (fail-open) through 1.8.x
    expect(validate({ a: 1, b: 2, c: 3 }, dict.schema)).toBeFalse()
    expect(validate({ a: 1 }, dict.schema)).toBeTrue() // exactly at ceiling (inclusive)

    // strict / fullScan unchanged (still enforce)
    expect(validate({ a: 1, b: 2 }, dict.schema, { strict: true })).toBeFalse()
    expect(validate({ a: 1, b: 2 }, dict.schema, { fullScan: true })).toBeFalse()

    // enforced WITHOUT a full scan: a 500-key object over a ceiling of 5 fails
    // in default mode because the count short-circuits at max+1 (never counts all)
    const huge: Record<string, number> = {}
    for (let i = 0; i < 500; i++) huge[`k${i}`] = 1
    expect(validate(huge, s.record(s.number).max(5).schema)).toBeFalse()

    // property-count enforcement is independent of VALUE stride-sampling: a big
    // dict UNDER its ceiling still validates values by stride (bad @ unsampled idx passes)
    const data: Record<string, any> = {}
    for (let i = 0; i < 200; i++) data[`k_${String(i).padStart(3, '0')}`] = 1
    data['k_001'] = 'bad' // skipped by stride 97
    expect(validate(data, s.record(s.number).max(1000).schema)).toBeTrue()
  })

  test('Optimization: Dictionary Stride Skips Validation for large objects', () => {
    const dict = s.record(s.number)

    // Create object with 200 keys - step will be floor(200/97) = 2
    // So we check indices 0, 2, 4, ... and the last one (199)
    const data: Record<string, any> = {}
    for (let i = 0; i < 200; i++) data[`k_${String(i).padStart(3, '0')}`] = 1

    // Error at index 1 (k_001) - skipped by stride
    data['k_001'] = 'bad_string'

    // Should return TRUE because we skipped the bad key
    expect(validate(data, dict.schema)).toBeTrue()

    // But index 0 (k_000) would be caught
    data['k_001'] = 1 // fix it
    data['k_000'] = 'bad_string'
    expect(validate(data, dict.schema)).toBeFalse()
  })

  test('Optimization: Small dictionaries are fully validated', () => {
    const dict = s.record(s.number)

    // Create object with 50 keys (< STRIDE of 97)
    const data: Record<string, any> = {}
    for (let i = 0; i < 50; i++) data[`k_${i}`] = 1

    // Any bad value should be caught in small objects
    data['k_25'] = 'bad_string'
    expect(validate(data, dict.schema)).toBeFalse()
  })

  test('Optimization: Callback does NOT disable Stride', () => {
    const dict = s.record(s.number)
    const data: Record<string, any> = {}
    for (let i = 0; i < 200; i++) data[`k_${String(i).padStart(3, '0')}`] = 1

    // Error at index 1 - skipped by stride
    data['k_001'] = 'bad_string'

    let called = false
    // Pass dummy callback -> optimization should remain active -> returns TRUE
    expect(
      validate(data, dict.schema, () => {
        called = true
      })
    ).toBeTrue()
    expect(called).toBeFalse()
  })
})

describe('Optimization: Array Stride', () => {
  test('skips validation for indices not matching the stride', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)

    // Index 1 is skipped by the stride logic (stride 97)
    largeData[1] = 'bad_string'
    expect(validate(largeData, listSchema.schema)).toBeTrue()
  })

  test('Callback does NOT disable Stride', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)

    // Hidden error
    largeData[1] = 'bad_string'

    let called = false
    // Should remain fast and skip the error
    expect(
      validate(largeData, listSchema.schema, () => {
        called = true
      })
    ).toBeTrue()
    expect(called).toBeFalse()
  })

  test('Callback receives error info', () => {
    const schema = s.object({ user: s.number })
    let err = {} as any

    // Supports direct callback passing
    const valid = validate({ user: 'bad' }, schema.schema, (path, msg) => {
      err = { path, msg }
    })

    expect(valid).toBeFalse()
    expect(err.path).toBe('user')
  })

  test('Optimization: strict mode forces full check', () => {
    const list = s.array(s.number)
    const data = new Array(200).fill(1)
    data[1] = 'bad' // Skipped by stride

    // strict mode catches the error
    expect(validate(data, list.schema, { strict: true })).toBeFalse()
  })

  test('catches validation errors on the first element (Head check)', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)
    largeData[0] = 'bad_string'
    expect(validate(largeData, listSchema.schema)).toBeFalse()
  })

  test('catches validation errors on the last element (Tail check)', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)
    largeData[199] = 'bad_string'
    expect(validate(largeData, listSchema.schema)).toBeFalse()
  })
})

// --- 4. CALLBACK ERROR REPORTING ---
describe('Callback Error Reporting', () => {
  test('Collects errors via callback', () => {
    const schema = s.object({
      user: s.object({ name: s.number }), // Wrong type
    })

    let error: { path: string; msg: string } | null = null

    const isValid = validate(
      { user: { name: 'string' } },
      schema.schema,
      (path, msg) => {
        error = { path, msg }
      }
    )

    expect(isValid).toBeFalse()
    expect(error).not.toBeNull()
    expect(error!.path).toBe('user.name')
    expect(error!.msg).toContain('Expected number')
  })

  test('Can throw via callback', () => {
    const schema = s.number.min(10)

    expect(() => {
      validate(5, schema.schema, (path, msg) => {
        throw new Error(`${path}: ${msg}`)
      })
    }).toThrow()
  })

  test('Stops at first error (Fail Fast)', () => {
    const schema = s.object({
      a: s.number,
      b: s.number,
    })

    const errors: any[] = []
    // Both are wrong, but it should fail fast after 'a'
    const isValid = validate({ a: 'bad', b: 'bad' }, schema.schema, (_, m) =>
      errors.push(m)
    )

    expect(isValid).toBeFalse()
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('Expected number')
  })
})

// --- 5. ALGEBRA (Unions, Enums, Diffs) ---
describe('Algebra', () => {
  test('validates Enums', () => {
    const Role = s.enum(['admin', 'user'])
    expect(validate('admin', Role.schema)).toBeTrue()
    expect(validate('guest', Role.schema)).toBeFalse()

    const Status = s.enum([200, 404])
    expect(validate(200, Status.schema)).toBeTrue()
    expect(validate(500, Status.schema)).toBeFalse()
  })

  test('validates Const', () => {
    // String const
    const Version = s.const('v1')
    expect(validate('v1', Version.schema)).toBeTrue()
    expect(validate('v2', Version.schema)).toBeFalse()

    // Number const
    const PI = s.const(3.14159)
    expect(validate(3.14159, PI.schema)).toBeTrue()
    expect(validate(3.14, PI.schema)).toBeFalse()

    // Boolean const
    const AlwaysTrue = s.const(true)
    expect(validate(true, AlwaysTrue.schema)).toBeTrue()
    expect(validate(false, AlwaysTrue.schema)).toBeFalse()

    // Null const
    const Nullable = s.const(null)
    expect(validate(null, Nullable.schema)).toBeTrue()
    expect(validate(undefined, Nullable.schema)).toBeFalse()
    expect(validate('null', Nullable.schema)).toBeFalse()
  })

  test('validates Unions (Primitive & Object)', () => {
    const ID = s.union([s.string, s.number])
    expect(validate('abc', ID.schema)).toBeTrue()
    expect(validate(123, ID.schema)).toBeTrue()
    expect(validate(true, ID.schema)).toBeFalse()

    const Cat = s.object({ type: s.enum(['cat']), meow: s.boolean })
    const Dog = s.object({ type: s.enum(['dog']), bark: s.boolean })
    const Pet = s.union([Cat, Dog])

    expect(validate({ type: 'cat', meow: true }, Pet.schema)).toBeTrue()
    expect(validate({ type: 'dog', bark: true }, Pet.schema)).toBeTrue()
    expect(validate({ type: 'cat', bark: true }, Pet.schema)).toBeFalse()
  })

  test('additionalProperties: false rejects unknown keys (builder default)', () => {
    const User = s.object({ name: s.string })
    expect(validate({ name: 'x' }, User)).toBeTrue()
    expect(validate({ name: 'x', evil: 1 }, User)).toBeFalse()
    // explicit plain-schema form, with and without properties
    expect(
      validate({ a: 1, b: 2 }, {
        type: 'object',
        properties: { a: { type: 'number' } },
        additionalProperties: false,
      })
    ).toBeFalse()
    expect(
      validate({ any: 1 }, { type: 'object', additionalProperties: false })
    ).toBeFalse()
    // absent or schema-valued additionalProperties still allows extras
    expect(validate({ a: 1, b: 2 }, { type: 'object', properties: { a: { type: 'number' } } })).toBeTrue()
    expect(validate({ a: 1, b: 2 }, s.record(s.number))).toBeTrue()
  })

  test('boolean schemas: true accepts everything, false accepts nothing', () => {
    expect(validate(42, true)).toBeTrue()
    expect(validate(42, false)).toBeFalse()
    expect(validate(undefined, false)).toBeFalse()
    expect(
      validate({ a: 1 }, { type: 'object', properties: { a: false } })
    ).toBeFalse()
    expect(
      validate({}, { type: 'object', properties: { a: false } })
    ).toBeTrue()
  })

  test('every ENFORCED_KEYWORD is demonstrably enforced (drift test)', () => {
    const prev = setPredicateEvaluator((src, v) => (0, eval)(src)(v))
    try {
      // keyword → [schema, passing value, failing value]
      const table: Record<string, [any, any, any]> = {
        type: [{ type: 'string' }, 'x', 1],
        properties: [{ type: 'object', properties: { a: { type: 'number' } } }, { a: 1 }, { a: 'x' }],
        required: [{ type: 'object', required: ['a'] }, { a: 1 }, {}],
        items: [{ type: 'array', items: { type: 'number' } }, [1], ['x']],
        enum: [{ enum: ['a', 'b'] }, 'a', 'c'],
        const: [{ const: 5 }, 5, 6],
        anyOf: [{ anyOf: [{ type: 'string' }] }, 'x', 1],
        oneOf: [{ oneOf: [{ type: 'string' }, { type: 'number' }] }, 'x', true],
        minimum: [{ type: 'number', minimum: 1 }, 1, 0],
        maximum: [{ type: 'number', maximum: 1 }, 1, 2],
        exclusiveMinimum: [{ type: 'number', exclusiveMinimum: 0 }, 1, 0],
        exclusiveMaximum: [{ type: 'number', exclusiveMaximum: 10 }, 9, 10],
        multipleOf: [{ type: 'number', multipleOf: 2 }, 4, 3],
        minLength: [{ type: 'string', minLength: 2 }, 'ab', 'a'],
        maxLength: [{ type: 'string', maxLength: 1 }, 'a', 'ab'],
        pattern: [{ type: 'string', pattern: '^a$' }, 'a', 'b'],
        format: [{ type: 'string', format: 'email' }, 'a@b.co', 'nope'],
        minItems: [{ type: 'array', minItems: 1 }, [1], []],
        maxItems: [{ type: 'array', maxItems: 1 }, [1], [1, 2]],
        minProperties: [{ type: 'object', minProperties: 1 }, { a: 1 }, {}],
        maxProperties: [{ type: 'object', maxProperties: 1 }, { a: 1 }, { a: 1, b: 2 }],
        additionalProperties: [
          { type: 'object', properties: { a: { type: 'number' } }, additionalProperties: false },
          { a: 1 },
          { a: 1, b: 2 },
        ],
        $predicate: [{ type: 'number', $predicate: '(n) => n > 0' }, 1, -1],
        'x-tjs-undefined': [{ type: 'null', 'x-tjs-undefined': true }, undefined, null],
      }
      for (const keyword of ENFORCED_KEYWORDS) {
        expect(table[keyword]).toBeDefined()
        const [schema, pass, fail] = table[keyword]!
        // strict path
        expect(validate(pass, schema, { strict: true })).toBeTrue()
        expect(validate(fail, schema, { strict: true })).toBeFalse()
        // DEFAULT path too — this is the guard that #8/#9 slipped past: a
        // keyword can sit in ENFORCED_KEYWORDS yet be skipped by the lenient
        // default path (maxProperties did, for three minor versions). Fixtures
        // are tiny (no >97 stride sampling), so every enforced keyword MUST
        // reject its fail case without strict. If a future keyword is only
        // strict-enforced, this fails loudly instead of shipping fail-open.
        expect(validate(pass, schema)).toBeTrue()
        expect(validate(fail, schema)).toBeFalse()
      }
    } finally {
      setPredicateEvaluator(prev)
    }
  })

  test('optional never leaks an internal marker into serialized schema (issue #3)', () => {
    // exact repro from the issue: no invalid type, no x-tjs-* marker
    const o = s.object({ a: s.any.describe('x').optional })
    expect(o.schema.properties!.a).toEqual({ description: 'x' })
    expect(JSON.stringify(o.schema)).not.toContain('x-tjs-optional')
    // s.any.optional is spec-valid: an empty schema, no bogus type array
    expect(s.any.optional.schema).toEqual({})
    // the optional flag rides on the builder, order-independent
    expect((s.any.optional.describe('x') as any)._optional).toBe(true)
    expect((s.any.describe('x').optional as any)._optional).toBe(true)
    // and it survives chaining AFTER .optional, so the field stays non-required
    const composed = s.object({
      a: s.any.optional.describe('x'),
      b: s.string,
    })
    expect(composed.schema.required).toEqual(['b'])
    expect(validate({ b: 'y' }, composed)).toBeTrue()
    expect(validate({ b: 'y', a: 42 }, composed)).toBeTrue()
  })

  test('.optional on typeless builders (const/union/any) keeps their semantics AND accepts null', () => {
    const OptUnion = s.union([s.string, s.number]).optional
    expect(validate('hello', OptUnion)).toBeTrue()
    expect(validate(42, OptUnion)).toBeTrue()
    expect(validate(null, OptUnion)).toBeTrue()
    expect(validate(true, OptUnion)).toBeFalse()
    // no junk in the emitted schema — never a type array with undefined
    expect(JSON.stringify(OptUnion.schema)).not.toContain('null,"null"')

    const OptConst = s.const('a').optional
    expect(validate('a', OptConst)).toBeTrue()
    expect(validate(null, OptConst)).toBeTrue()
    expect(validate('b', OptConst)).toBeFalse()

    expect(validate(42, s.any.optional)).toBeTrue()
    expect(validate(null, s.any.optional)).toBeTrue()

    // object composition: optional typeless property is not required
    const Tagged = s.object({ tag: s.union([s.string, s.number]).optional })
    expect(validate({}, Tagged)).toBeTrue()
    expect(validate({ tag: 'x' }, Tagged)).toBeTrue()
    expect(validate({ tag: null }, Tagged)).toBeTrue()
    expect(validate({ tag: true }, Tagged)).toBeFalse()

    // idempotent: .optional.optional does not duplicate null anywhere
    const Twice = s.enum(['a']).optional.optional
    expect(Twice.schema.enum).toEqual(['a', null])
    expect(Twice.schema.type).toEqual(['string', 'null'])

    // junk type-array entries are ignored: ['junk','null'] declares only
    // null; a junk-only array is treated as typeless, not as "expect null"
    expect(validate(null, { type: [undefined, 'null'] } as any)).toBeTrue()
    expect(validate('hi', { type: [undefined, 'null'] } as any)).toBeFalse()
    expect(validate('hi', { type: [undefined] } as any)).toBeTrue()
  })

  test('s.record without a value schema throws an actionable error', () => {
    expect(() => (s.record as any)()).toThrow('s.record(s.any)')
  })

  test('enum constrains null like every other instance (spec semantics)', () => {
    // null passes an enum only when the enum lists it
    expect(validate(null, { type: ['null', 'string'], enum: ['a', 'b'] })).toBeFalse()
    expect(validate(null, { type: ['null', 'string'], enum: ['a', null] })).toBeTrue()
    expect(validate(null, { enum: ['a', 'b'] })).toBeFalse()
    expect(validate('a', { type: ['string', 'null'], enum: ['a', 'b'] })).toBeTrue()
    // the builder keeps .optional's intent by adding null to the enum
    const Role = s.enum(['admin', 'user']).optional
    expect(Role.schema.enum).toEqual(['admin', 'user', null])
    expect(validate(null, Role)).toBeTrue()
    expect(validate('admin', Role)).toBeTrue()
    expect(validate('other', Role)).toBeFalse()
  })

  test('sibling constraints beside anyOf/const are enforced, not short-circuited', () => {
    expect(validate('ab', { const: 'ab' })).toBeTrue()
    expect(validate('ab', { const: 'ab', minLength: 5 })).toBeFalse()
    expect(validate('xx', { anyOf: [{ type: 'string' }], maxLength: 2 })).toBeTrue()
    expect(validate('xxxx', { anyOf: [{ type: 'string' }], maxLength: 2 })).toBeFalse()
    expect(validate({}, { anyOf: [{ type: 'object' }], required: ['a'] })).toBeFalse()
    expect(validate({ a: 1 }, { anyOf: [{ type: 'object' }], required: ['a'] })).toBeTrue()
  })

  test('oneOf propagates { strict } into branch re-entry (bad elem at an unsampled index)', () => {
    // mirror of the anyOf strict-sampling guard: oneOf re-enters validate()
    // per branch, so the strict flag must reach the branch that walks a huge
    // array. A single non-number at an unsampled index (stride 97) is skipped
    // sampled, caught under strict.
    const schema = { oneOf: [{ type: 'array', items: { type: 'number' } }, { type: 'string' }] }
    const arr = new Array(200).fill(1)
    arr[1] = 'bad' // index 1 falls between stride-97 probes
    expect(validate(arr, schema)).toBeTrue() // sampled: the bad elem is skipped
    expect(validate(arr, schema, { strict: true })).toBeFalse() // strict: caught
  })

  test('filter cannot be prototype-polluted via an own __proto__ key', () => {
    const dirty = JSON.parse('{"p":"q","__proto__":{"a":"hi"}}')
    const out = filter(dirty, {
      type: 'object',
      properties: { p: { type: 'string' } },
      additionalProperties: { type: 'object' },
    })
    expect(out).not.toBeInstanceOf(Error)
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect((out as any).a).toBeUndefined()
    // the own key survives as DATA, not as a prototype
    expect(Object.getOwnPropertyNames(out)).toContain('__proto__')
  })

  test('filter applies additionalProperties-as-schema without sibling properties', () => {
    expect(
      filter({ x: { a: 'hi', junk: 42 } }, {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
      })
    ).toEqual({ x: { a: 'hi' } })
  })

  test('filter never throws: malformed schemas return an Error', () => {
    const verdict = filter({ a: 1 }, { type: 'object', required: 42 })
    expect(verdict).toBeInstanceOf(Error)
    expect((verdict as Error).message).toContain('internal validation error')
    // a malformed union branch is skipped, not thrown through
    expect(
      filter('ok', { anyOf: [{ required: 42 }, { type: 'string' }] })
    ).toBe('ok')
  })

  test('filter handles boolean schemas', () => {
    expect(filter(1, true)).toBe(1)
    expect(filter(1, false)).toBeInstanceOf(Error)
    expect(
      filter({ k: 1 }, { type: 'object', properties: { k: false } })
    ).toBeInstanceOf(Error)
  })

  test('oneOf: exactly one branch must match (#8)', () => {
    const shape = {
      oneOf: [
        { type: 'object', properties: { kind: { const: 'circle' }, r: { type: 'number' } }, required: ['kind', 'r'] },
        { type: 'object', properties: { kind: { const: 'square' }, s: { type: 'number' } }, required: ['kind', 's'] },
      ],
    }
    expect(validate({ kind: 'circle', r: 2 }, shape)).toBeTrue()
    expect(validate({ kind: 'circle', r: 'big' }, shape)).toBeFalse() // no branch matches
    // matching MORE than one branch fails (the oneOf footgun, enforced)
    expect(validate(5, { oneOf: [{ type: 'number' }, { type: 'integer' }] })).toBeFalse()
    expect(validate(5.5, { oneOf: [{ type: 'number' }, { type: 'integer' }] })).toBeTrue()
    // oneOf is a constraint; siblings still apply
    expect(validate('abcd', { oneOf: [{ type: 'string' }], maxLength: 2 })).toBeFalse()
  })

  test('exclusiveMinimum / exclusiveMaximum enforced (#8)', () => {
    expect(validate(0, { type: 'number', exclusiveMinimum: 0 })).toBeFalse()
    expect(validate(1, { type: 'number', exclusiveMinimum: 0 })).toBeTrue()
    expect(validate(10, { type: 'number', exclusiveMaximum: 10 })).toBeFalse()
    expect(validate(9, { type: 'number', exclusiveMaximum: 10 })).toBeTrue()
  })

  test('oneOf warns once per process about cost, silenceable and re-armable', () => {
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: string) => void warns.push(String(m))
    try {
      setWarnings(true) // re-arms the once-per-process latch
      const schema = { oneOf: [{ type: 'string' }, { type: 'number' }] }
      validate('a', schema)
      validate('b', schema) // same node → no second warning
      expect(warns.length).toBe(1)
      expect(warns[0]).toContain('oneOf')
      expect(warns[0]).toContain('anyOf')
      // a DISTINCT schema node does NOT warn again — the nudge is generic and
      // fires once per process (this is what keeps wire-parsed-per-request
      // schemas from re-spamming, since dedup is not keyed on object identity)
      validate('c', { oneOf: [{ type: 'string' }] })
      expect(warns.length).toBe(1)
      // silenced
      setWarnings(false)
      validate('d', { oneOf: [{ type: 'number' }] })
      expect(warns.length).toBe(1)
      // re-enabling re-arms the latch → warns once more
      setWarnings(true)
      validate('e', { oneOf: [{ type: 'number' }] })
      expect(warns.length).toBe(2)
    } finally {
      console.warn = orig
      setWarnings(false)
    }
  })

  test('strict propagates through the multi-type union dispatch (>97-item array)', () => {
    // a bad element at an unsampled index inside a union-typed array must be
    // caught under strict — pins option propagation across the inline union
    const schema = { type: 'array', items: { type: ['string', 'number'] } }
    const big: any[] = Array.from({ length: 500 }, (_, i) => i)
    big[3] = { not: 'a scalar' } // neither string nor number, at a sampled-past index
    expect(validate(big, schema)).toBeTrue() // sampled: legitimately missed
    expect(validate(big, schema, { strict: true })).toBeFalse()
  })

  test('a scalar constraint applies to the matched branch of a multi-type union', () => {
    const schema = { type: ['string', 'number'], minLength: 3 }
    expect(validate('abc', schema)).toBeTrue()
    expect(validate('ab', schema)).toBeFalse() // minLength applies to the string branch
    expect(validate(5, schema)).toBeTrue() // number branch: minLength doesn't apply
  })

  test('multi-type arrays validate with union semantics (any listed type)', () => {
    // T | null (order-independent)
    expect(validate('hi', { type: ['null', 'string'] })).toBeTrue()
    expect(validate('hi', { type: ['string', 'null'] })).toBeTrue()
    expect(validate(null, { type: ['null', 'string'] })).toBeTrue()
    expect(validate(1, { type: ['null', 'string'] })).toBeFalse()
    // genuine multi-type union: a value matching ANY listed type passes
    expect(validate(5, { type: ['string', 'number'] })).toBeTrue()
    expect(validate('x', { type: ['string', 'number'] })).toBeTrue()
    expect(validate(true, { type: ['string', 'number'] })).toBeFalse()
    // integer vs number distinction is honored within a union
    expect(validate(5, { type: ['integer', 'string'] })).toBeTrue()
    expect(validate(5.5, { type: ['integer', 'string'] })).toBeFalse()
    // the matching branch's applicators/constraints apply
    expect(
      validate({ a: 1 }, {
        type: ['object', 'string'],
        properties: { a: { type: 'number' } },
        additionalProperties: false,
      })
    ).toBeTrue()
    expect(
      validate({ a: 1, extra: 2 }, {
        type: ['object', 'string'],
        properties: { a: { type: 'number' } },
        additionalProperties: false,
      })
    ).toBeFalse()
    // null-only still means null-only
    expect(validate('hi', { type: ['null'] })).toBeFalse()
    expect(validate(null, { type: ['null'] })).toBeTrue()
  })

  test('prototype-named keys are treated as data, not exempted via the prototype chain', () => {
    const User = s.object({ a: s.number })
    // smuggled prototype-named extras are refused, not silently exempted
    expect(validate({ a: 1, constructor: 'evil' }, User)).toBeFalse()
    expect(validate({ a: 1, toString: 'evil' }, User)).toBeFalse()
    // required is satisfied by OWN keys only — not by Object.prototype
    expect(validate({}, { type: 'object', required: ['constructor'] })).toBeFalse()
    expect(
      validate({ constructor: 'mine' }, { type: 'object', required: ['constructor'] })
    ).toBeTrue()
    // a schema-declared prototype-named property is validated as data
    const Weird = s.object({ constructor: s.string })
    expect(validate({ constructor: 'fine' }, Weird)).toBeTrue()
    expect(validate({}, Weird)).toBeFalse()
  })

  test('min/maxItems enforced without an items schema', () => {
    expect(validate([], { type: 'array', minItems: 1 })).toBeFalse()
    expect(validate([1], { type: 'array', minItems: 1 })).toBeTrue()
    expect(validate([1, 2, 3], { type: 'array', maxItems: 2 })).toBeFalse()
  })

  test('typeless schemas apply object/array keywords when the value matches (JSON Schema semantics)', () => {
    const shape = { properties: { a: { type: 'string' } }, required: ['a', 'b'] }
    expect(validate({ a: 42 }, shape)).toBeFalse() // wrong type + missing b
    expect(validate({ a: 'x', b: 1 }, shape)).toBeTrue()
    // per spec, object keywords do not constrain non-objects
    expect(validate('just a string', shape)).toBeTrue()
    expect(validate([], { minItems: 1 })).toBeFalse()
  })

  test('strict mode propagates into union branches (no sampling gap)', () => {
    const Union = s.union([s.array(s.number)])
    const big: any[] = Array.from({ length: 500 }, (_, i) => i)
    big[3] = 'bad' // an index stride sampling skips
    expect(validate(big, Union.schema)).toBeTrue() // sampled: legitimately missed
    expect(validate(big, Union.schema, { strict: true })).toBeFalse()
  })

  test('Diffing Logic', () => {
    // Identical
    expect(diff(s.string.min(5).schema, s.string.min(5).schema)).toBeNull()

    // Basic mismatch
    const d1 = diff(s.string.schema, s.number.schema)
    expect(d1.error).toContain('Type mismatch')

    // Structural
    const V1 = s.object({ score: s.number.min(10) })
    const V2 = s.object({ score: s.number.min(20) })
    const d2 = diff(V1.schema, V2.schema)
    expect(d2.score.minimum.from).toBe(10)
    expect(d2.score.minimum.to).toBe(20)

    // Added/Removed keys
    const A = s.object({ a: s.string })
    const B = s.object({ a: s.string, b: s.number })
    const d3 = diff(A.schema, B.schema)
    expect(d3.b.error).toContain('Added in B')

    // Ghost Property Diffing (Should still be visible in diffs)
    const G1 = s.record(s.string).max(5)
    const G2 = s.record(s.string).max(10)
    const d4 = diff(G1.schema, G2.schema)
    expect(d4.maxProperties.from).toBe(5)
    expect(d4.maxProperties.to).toBe(10)

    // Const diffing
    const C1 = s.const('v1')
    const C2 = s.const('v2')
    const d5 = diff(C1.schema, C2.schema)
    expect(d5.const.from).toBe('v1')
    expect(d5.const.to).toBe('v2')
  })
})

// --- 6. IMPLEMENTATION DETAILS ("THE LIE") ---
describe('Implementation Details', () => {
  test('The Lie: Runtime builder is universal', () => {
    // TS would block this, but runtime allows it

    // .url is a getter
    const dirtyString = (s.number as any).url
    expect(dirtyString.schema.format).toBe('uri')

    // .min() is a function
    const dirtyBool = (s.boolean as any).min(5)
    expect(dirtyBool.schema.minimum).toBe(5)
  })
})

describe('Tuples', () => {
  test('validates fixed-length tuples', () => {
    const Coordinate = s.tuple([s.number, s.number])

    expect(validate([10, 20], Coordinate.schema)).toBeTrue()

    // Wrong Types
    expect(validate(['10', 20], Coordinate.schema)).toBeFalse()

    // Wrong Length
    expect(validate([10], Coordinate.schema)).toBeFalse()
    expect(validate([10, 20, 30], Coordinate.schema)).toBeFalse()
  })

  test('validates mixed-type tuples', () => {
    const UserRow = s.tuple([s.number, s.string, s.boolean]) // [ID, Name, IsActive]

    expect(validate([1, 'Alice', true], UserRow.schema)).toBeTrue()
    expect(validate([1, 'Alice', 'yes'], UserRow.schema)).toBeFalse()
  })
})

describe('Metadata & Documentation', () => {
  test('Attaches standard metadata', () => {
    const schema = s.string
      .title('Username')
      .describe('Unique identifier')
      .default('guest')

    expect(schema.schema.title).toBe('Username')
    expect(schema.schema.description).toBe('Unique identifier')
    expect(schema.schema.default).toBe('guest')
  })

  test('Attaches arbitrary metadata via .meta()', () => {
    const schema = s.object({ id: s.number }).meta({
      $schema: 'http://json-schema.org/draft-07/schema#',
      examples: [{ id: 1 }],
    })

    expect(schema.schema.$schema).toContain('draft-07')
    expect((schema.schema.examples![0] as {id: number}).id).toBe(1)
  })

  test('Chaining metadata does not break types', () => {
    // Ensure .min() is still available after .title() on a string
    const schema = s.string.title('Code').min(3)
    expect(schema.schema.minLength).toBe(3)
    expect(schema.schema.title).toBe('Code')
  })
})

describe('First-Class Integer', () => {
  test('s.integer generates correct schema type', () => {
    const schema = s.integer
    expect(schema.schema.type).toBe('integer')
  })

  test('s.integer validates integers only', () => {
    const schema = s.integer
    expect(validate(10, schema.schema)).toBeTrue()
    expect(validate(10.5, schema.schema)).toBeFalse() // Float
    expect(validate('10', schema.schema)).toBeFalse() // String
  })

  test('s.integer supports numeric constraints', () => {
    const schema = s.integer.min(0).max(10)
    expect(validate(5, schema.schema)).toBeTrue()
    expect(validate(-1, schema.schema)).toBeFalse()
    expect(validate(11, schema.schema)).toBeFalse()
  })

  test('Diff detects integer vs number', () => {
    const d = diff(s.number.schema, s.integer.schema)
    expect(d.error).toContain('Type mismatch: number vs integer')
  })
})

describe('First-Class Formats & Pattern', () => {
  test('s.email generates correct schema', () => {
    const schema = s.email
    expect(schema.schema.type).toBe('string')
    expect(schema.schema.format).toBe('email')
  })

  test('s.email.pattern() constraints both', () => {
    const schema = s.email.pattern(/@gmail\.com$/)

    expect(validate('test@gmail.com', schema.schema)).toBeTrue()
    expect(validate('test@yahoo.com', schema.schema)).toBeFalse() // Valid email, wrong regex
    expect(validate('not-an-email', schema.schema)).toBeFalse() // Invalid format
  })

  test('s.pattern() generates correct schema', () => {
    const schema = s.pattern(/^\d+$/)
    expect(schema.schema.type).toBe('string')
    expect(schema.schema.pattern).toBe('^\\d+$')

    expect(validate('123', schema.schema)).toBeTrue()
    expect(validate('abc', schema.schema)).toBeFalse()
  })

  test('s.url and other formats work at root', () => {
    expect(validate('https://example.com', s.url.schema)).toBeTrue()
    expect(
      validate('123e4567-e89b-12d3-a456-426614174000', s.uuid.schema)
    ).toBeTrue()
  })
})

// --- 12. STATIC TYPE INFERENCE ---
// --- FILTER ---
describe('Filter', () => {
  test('strips extra properties from objects', () => {
    const User = s.object({ id: s.number, name: s.string })
    const input = { id: 1, name: 'Alice', extra: 'stuff', debug: true }
    const result = filter(input, User)
    
    expect(result).toEqual({ id: 1, name: 'Alice' })
    expect(result.extra).toBeUndefined()
  })

  test('works with nested objects', () => {
    const schema = s.object({
      user: s.object({ id: s.number }),
    })
    const input = { user: { id: 1, secret: 'password' }, token: 'abc' }
    const result = filter(input, schema)
    
    expect(result).toEqual({ user: { id: 1 } })
  })

  test('works with arrays', () => {
    const schema = s.array(s.object({ id: s.number }))
    const input = [{ id: 1, extra: 'a' }, { id: 2, extra: 'b' }]
    const result = filter(input, schema)
    
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
  })

  test('works with tuples', () => {
    const schema = s.tuple([s.object({ x: s.number }), s.object({ y: s.number })])
    const input = [{ x: 1, extra: 'a' }, { y: 2, extra: 'b' }]
    const result = filter(input, schema)
    
    expect(result).toEqual([{ x: 1 }, { y: 2 }])
  })

  test('works with tuples (skipValidation strips extra elements)', () => {
    const schema = s.tuple([s.object({ x: s.number }), s.object({ y: s.number })])
    const input = [{ x: 1, extra: 'a' }, { y: 2, extra: 'b' }, { z: 3 }]
    const result = filter(input, schema, { skipValidation: true })
    
    expect(result).toEqual([{ x: 1 }, { y: 2 }])
  })

  test('returns Error on validation failure (default)', () => {
    const schema = s.object({ id: s.number })
    const input = { id: 'not a number' }
    const result = filter(input, schema)
    
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toContain('id')
  })

  test('skips validation with skipValidation option', () => {
    const schema = s.object({ id: s.number })
    const input = { id: 'not a number', extra: 'stuff' }
    const result = filter(input, schema, { skipValidation: true })
    
    expect(result).toEqual({ id: 'not a number' })
    expect(result).not.toBeInstanceOf(Error)
  })

  test('fullScan catches errors in skipped positions', () => {
    const schema = s.array(s.number)
    const input = new Array(200).fill(1)
    input[1] = 'bad' // Would be skipped by stride

    // Default (skip mode) - should pass
    const resultSkip = filter(input, schema)
    expect(resultSkip).not.toBeInstanceOf(Error)

    // Full scan - should catch the error
    const resultFull = filter(input, schema, { fullScan: true })
    expect(resultFull).toBeInstanceOf(Error)
  })

  test('calls onError callback on validation failure', () => {
    const schema = s.object({ id: s.number })
    const input = { id: 'bad' }
    
    let errorPath = ''
    let errorMsg = ''
    const result = filter(input, schema, (path, msg) => {
      errorPath = path
      errorMsg = msg
    })
    
    expect(result).toBeInstanceOf(Error)
    expect(errorPath).toBe('id')
    expect(errorMsg).toContain('Expected number')
  })

  test('calls onError via options object', () => {
    const schema = s.object({ id: s.number })
    const input = { id: 'bad' }
    
    let errorPath = ''
    const result = filter(input, schema, {
      onError: (path) => { errorPath = path }
    })
    
    expect(result).toBeInstanceOf(Error)
    expect(errorPath).toBe('id')
  })

  test('preserves null and undefined values', () => {
    const schema = s.object({ val: s.string.optional })
    
    expect(filter({ val: null }, schema, { skipValidation: true })).toEqual({ val: null })
    expect(filter({ val: undefined }, schema, { skipValidation: true })).toEqual({ val: undefined })
  })

  test('accepts builder directly (not just .schema)', () => {
    const User = s.object({ id: s.number })
    const result = filter({ id: 1, extra: true }, User)
    expect(result).toEqual({ id: 1 })
  })
})

describe('Static Type Inference', () => {
  test('First-class types infer correct primitives', () => {
    // Define a schema using the new first-class properties
    const schema = s.object({
      email: s.email, // Should infer string
      uuid: s.uuid, // Should infer string
      date: s.datetime, // Should infer string
      count: s.integer, // Should infer number
      regex: s.pattern(/^\d+$/), // Should infer string
      flag: s.boolean, // Should infer boolean
    })

    // Extract the type
    type DataType = Infer<typeof schema>

    // 1. Compile-Time Check
    // If inference is broken (e.g. mapped to 'any' or 'never'),
    // or if integer mapped to string, this assignment would likely flag warnings in an IDE.
    const data: DataType = {
      email: 'test@test.com',
      uuid: '123-456',
      date: '2023-01-01',
      count: 10,
      regex: '123',
      flag: true,
    }

    // 2. Runtime Check
    // Verify that the runtime values actually match the expected primitives
    expect(typeof data.email).toBe('string')
    expect(typeof data.count).toBe('number')
    expect(typeof data.flag).toBe('boolean')
  })

  test('Optional first-class types infer as union with undefined', () => {
    const schema = s.object({
      optEmail: s.email.optional,
      optInt: s.integer.optional,
    })

    type DataType = Infer<typeof schema>

    const valid: DataType = {} // Should be valid
    const explicit: DataType = { optEmail: undefined, optInt: 5 }

    expect(valid).toEqual({})
    expect(explicit.optInt).toBe(5)
  })
})
