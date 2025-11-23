import { describe, test, expect } from 'bun:test'
import { s, validate, diff, type Infer } from './schema'

// --- 1. BUILDER STRUCTURE CHECKS ---
describe('Builder Output', () => {
  test('generates correct JSON Schema structure', () => {
    const schema = s.object({
      name: s.string,
      age: s.number.min(18),
    })

    expect(schema.schema.type).toBe('object')
    expect(schema.schema.properties.age.minimum).toBe(18)
    expect(schema.schema.required).toContain('name')
    expect(schema.schema.additionalProperties).toBe(false)
  })

  test('handles nested array schemas', () => {
    const schema = s.array(s.string)
    expect(schema.schema.type).toBe('array')
    expect(schema.schema.items.type).toBe('string')
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

  test('maxProperties: GHOST CONSTRAINT (Documented but NOT Validated)', () => {
    const dict = s.record(s.number).max(1)

    // 1. Verify it exists in the Schema (for documentation/swagger)
    expect(dict.schema.maxProperties).toBe(1)

    // 2. Verify validation IGNORES it (Business logic separation)
    const hugePayload = { a: 1, b: 2, c: 3 }
    expect(validate(hugePayload, dict.schema)).toBeTrue()
  })

  test('Optimization: Dictionary Stride Skips Validation (Optimization is Always On)', () => {
    const STRIDE = 97
    const dict = s.record(s.number)

    // Create object with 200 keys
    const data: Record<string, any> = {}
    for (let i = 0; i < 200; i++) data[`k_${i}`] = 1

    // Error in a SKIPPED key (k_0 is index 1, skipped by stride 97 logic)
    data['k_0'] = 'bad_string'

    // Should return TRUE because we skipped the bad key
    expect(validate(data, dict.schema)).toBeTrue()
  })

  test('Optimization: Callback does NOT disable Stride', () => {
    const dict = s.record(s.number)
    const data: Record<string, any> = {}
    for (let i = 0; i < 200; i++) data[`k_${i}`] = 1

    // Error in skipped key
    data['k_0'] = 'bad_string'

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

  test('Optimization: fullScan forces check', () => {
    const list = s.array(s.number)
    const data = new Array(200).fill(1)
    data[1] = 'bad' // Skipped by stride

    // Should catch error
    expect(validate(data, list.schema, { fullScan: true })).toBeFalse()
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
    expect(schema.schema.examples[0].id).toBe(1)
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
