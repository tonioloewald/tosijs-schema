import { describe, test, expect } from 'bun:test'
import { s, validate, diff } from './schema'

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

    const Int = s.number.int
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

describe('Optimization: Array Stride', () => {
  test('skips validation for indices not matching the stride', () => {
    const listSchema = s.array(s.number)

    // Setup: Array length 200, STRIDE 97.
    // Logic: step = floor(200 / 97) = 2.
    // Validator checks: 0, 2, 4, 6... AND 199 (Tail)
    const largeData = new Array(200).fill(1)

    // Index 3 is ODD, so it is skipped by the step of 2
    largeData[3] = 'bad_string'
    expect(validate(largeData, listSchema.schema)).toBeTrue()
  })

  test('catches validation errors when they land on the stride', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)

    // Index 4 is EVEN, so it is hit by the step of 2
    largeData[4] = 'bad_string'
    expect(validate(largeData, listSchema.schema)).toBeFalse()
  })

  test('catches validation errors on the first element', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)

    largeData[0] = 'bad_string' // Head check
    expect(validate(largeData, listSchema.schema)).toBeFalse()
  })

  test('catches validation errors on the last element', () => {
    const listSchema = s.array(s.number)
    const largeData = new Array(200).fill(1)

    largeData[199] = 'bad_string' // Tail check
    expect(validate(largeData, listSchema.schema)).toBeFalse()
  })
})

// --- 3. ALGEBRA (Unions, Enums, Diffs) ---
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
  })
})

// --- 4. IMPLEMENTATION DETAILS ("THE LIE") ---
describe('Implementation Details', () => {
  test('The Lie: Runtime builder is universal', () => {
    // TS would block this, but runtime allows it

    // FIX: .int is now a getter (property), so we don't call it as a function
    const dirtyString = (s.string as any).int
    expect(dirtyString.schema.type).toBe('integer')

    // .min() is still a function (requires args)
    const dirtyBool = (s.boolean as any).min(5)
    expect(dirtyBool.schema.minimum).toBe(5)
  })
})
