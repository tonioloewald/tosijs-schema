import { describe, test, expect } from 'bun:test'
import { s, validate, diff } from './schema'

describe('builds', () => {
  test('generates correct JSON Schema structure', () => {
    const schema = s.object({
      name: s.string(),
      age: s.number().min(18),
    })

    expect(schema.schema.type).toBe('object')
    // Verify the 'min' constraint was hoisted into the schema
    expect(schema.schema.properties.age.minimum).toBe(18)
    // Verify default strictness
    expect(schema.schema.required).toContain('name')
    expect(schema.schema.additionalProperties).toBe(false)
  })

  test('handles nested array schemas', () => {
    const schema = s.array(s.string())
    expect(schema.schema.type).toBe('array')
    expect(schema.schema.items.type).toBe('string')
  })
})

describe('validates', () => {
  test('validates basic types correctly', () => {
    const User = s.object({
      id: s.number(),
      email: s.string(),
    })

    // Happy path
    expect(validate({ id: 1, email: 'test' }, User.schema)).toBeTrue()

    // Sad paths
    expect(validate({ id: '1', email: 'test' }, User.schema)).toBeFalse() // Type mismatch
    expect(validate({ id: 1 }, User.schema)).toBeFalse() // Missing key
    expect(validate(null, User.schema)).toBeFalse() // Null object
  })

  test('enforces numeric constraints', () => {
    const Rating = s.number().min(1).max(5)

    expect(validate(3, Rating.schema)).toBeTrue()
    expect(validate(0, Rating.schema)).toBeFalse() // Too low
    expect(validate(6, Rating.schema)).toBeFalse() // Too high
  })
})

describe('optimizes', () => {
  test('skips validation for indices not matching the stride', () => {
    const listSchema = s.array(s.number())

    // Setup: Array length 200.
    // Library Logic: Stride = floor(200 / 37) = 5.
    // The validator checks indices 0, 5, 10, 15...

    const largeData = new Array(200).fill(1)

    // Inject an error at index 3 (NOT a multiple of 5)
    // This proves we are NOT checking every item (O(1) vs O(N))
    largeData[3] = 'bad_string'

    expect(validate(largeData, listSchema.schema)).toBeTrue()
  })

  test('catches validation errors when they land on the stride', () => {
    const listSchema = s.array(s.number())
    const largeData = new Array(200).fill(1)

    // Inject an error at index 5 (IS a multiple of 5)
    largeData[5] = 'bad_string'

    expect(validate(largeData, listSchema.schema)).toBeFalse()
  })
})

describe('did', () => {
  test('returns null for identical schemas', () => {
    const s1 = s.string().min(5)
    const s2 = s.string().min(5)
    expect(diff(s1.schema, s2.schema)).toBeNull()
  })

  test('detects basic type mismatches', () => {
    const s1 = s.string()
    const s2 = s.number()
    const delta = diff(s1.schema, s2.schema)

    expect(delta).not.toBeNull()
    expect(delta.error).toContain('Type mismatch')
  })

  test('detects deep structural changes in objects', () => {
    const V1 = s.object({
      score: s.number().min(10),
      tags: s.array(s.string()),
    })

    const V2 = s.object({
      score: s.number().min(20), // Change 1: Constraint
      tags: s.array(s.number()), // Change 2: Type inside array
    })

    const delta = diff(V1.schema, V2.schema)

    expect(delta).not.toBeNull()

    // Check constraint diff
    expect(delta.score.minimum.from).toBe(10)
    expect(delta.score.minimum.to).toBe(20)

    // Check array item diff
    expect(delta.tags.items.error).toBeString() // Should describe type mismatch
  })

  test('detects added or removed keys', () => {
    const A = s.object({ a: s.string() })
    const B = s.object({ a: s.string(), b: s.number() })

    const delta = diff(A.schema, B.schema)
    expect(delta.b.error).toContain('Added in B')
  })
})

import { describe, test, expect } from 'bun:test'
import { s, validate } from './schema'

describe('String Formats & Constraints', () => {
  test('validates Regex Pattern', () => {
    // Pattern: Starts with 'user_' followed by 3 digits
    const schema = s.string().pattern('^user_\\d{3}$')

    expect(validate('user_123', schema.schema)).toBeTrue()
    expect(validate('user_abc', schema.schema)).toBeFalse() // Letters
    expect(validate('admin_123', schema.schema)).toBeFalse() // Wrong prefix

    // Verify schema output
    expect(schema.schema.pattern).toBe('^user_\\d{3}$')
  })

  test('validates Email', () => {
    const schema = s.string().email()

    expect(validate('test@example.com', schema.schema)).toBeTrue()
    expect(validate('not-an-email', schema.schema)).toBeFalse()
    expect(schema.schema.format).toBe('email')
  })

  test('validates UUID', () => {
    const schema = s.string().uuid()
    const validUUID = '123e4567-e89b-12d3-a456-426614174000'

    expect(validate(validUUID, schema.schema)).toBeTrue()
    expect(validate(validUUID.toUpperCase(), schema.schema)).toBeTrue() // Case insensitive
    expect(validate('123-456', schema.schema)).toBeFalse() // Bad format
  })

  test('validates IPv4', () => {
    const schema = s.string().ipv4()

    expect(validate('192.168.1.1', schema.schema)).toBeTrue()
    expect(validate('255.255.255.255', schema.schema)).toBeTrue()
    expect(validate('999.999.999.999', schema.schema)).toBeFalse() // Out of range
    expect(validate('192.168.1', schema.schema)).toBeFalse() // Too short
    expect(validate('abc.def.ghi.jkl', schema.schema)).toBeFalse() // Not numbers
  })

  test('validates URI/URL', () => {
    const schema = s.string().url()

    expect(validate('https://google.com', schema.schema)).toBeTrue()
    expect(
      validate('ftp://files.server.net:8080/path', schema.schema)
    ).toBeTrue()
    expect(validate('google.com', schema.schema)).toBeFalse() // Missing protocol
    expect(validate('/local/path', schema.schema)).toBeFalse() // Not a full URI
  })

  test('validates Date-Time (ISO 8601)', () => {
    const schema = s.string().datetime()

    expect(validate('2023-11-21T10:00:00Z', schema.schema)).toBeTrue()
    expect(validate('2023-11-21', schema.schema)).toBeTrue() // Date.parse accepts this
    expect(validate('Hello World', schema.schema)).toBeFalse()
  })
})

describe('Enum Constraints', () => {
  test('validates string enums', () => {
    const Role = s.enum(['admin', 'user', 'guest'])

    expect(validate('admin', Role.schema)).toBeTrue()
    expect(validate('user', Role.schema)).toBeTrue()

    expect(validate('superadmin', Role.schema)).toBeFalse() // Not in list
    expect(validate(123, Role.schema)).toBeFalse() // Wrong type
  })

  test('validates number enums', () => {
    const Status = s.enum([200, 404, 500])

    expect(validate(200, Status.schema)).toBeTrue()
    expect(validate(404, Status.schema)).toBeTrue()

    expect(validate(201, Status.schema)).toBeFalse() // Not in list
  })

  test('works correctly when nested in objects', () => {
    const Config = s.object({
      env: s.enum(['dev', 'prod']),
      retries: s.enum([1, 2, 3]),
    })

    expect(validate({ env: 'dev', retries: 1 }, Config.schema)).toBeTrue()
    expect(validate({ env: 'staging', retries: 1 }, Config.schema)).toBeFalse()
  })
})
