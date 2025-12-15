import { describe, test, expect } from 'bun:test'
import { s, validate } from './schema'

describe('s.any', () => {
  test('accepts primitives', () => {
    const S = s.any.schema
    expect(validate(true, S)).toBe(true)
    expect(validate(123, S)).toBe(true)
    expect(validate('str', S)).toBe(true)
  })

  test('accepts null and undefined', () => {
    const S = s.any.schema
    expect(validate(null, S)).toBe(true)
    expect(validate(undefined, S)).toBe(true)
  })

  test('accepts complex structures', () => {
    const S = s.any.schema
    expect(validate({ a: 1 }, S)).toBe(true)
    expect(validate([1, 2], S)).toBe(true)
  })

  test('works when nested in strict objects', () => {
    const User = s.object({
      id: s.number,
      metadata: s.any,
    })

    // Valid
    expect(User.validate({ id: 1, metadata: 'foo' })).toBe(true)
    expect(User.validate({ id: 1, metadata: { foo: 'bar' } })).toBe(true)
    expect(User.validate({ id: 1, metadata: null })).toBe(true)

    // Invalid (parent schema check)
    expect(User.validate({ id: 'bad', metadata: 'foo' })).toBe(false)
  })
})
