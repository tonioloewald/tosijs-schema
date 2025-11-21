/*
IMPORTANT

This file will blow up tests if type inference fails
*/

import { s, type Infer } from './schema'

// --- HELPER: The "Type Assert" Function ---
// This function does nothing at runtime.
// Its only job is to yell at you (compile error) if you pass the wrong type.
function assertType<Expected>(value: Expected) {
  // no-op
}

// --- TEST 1: Primitives ---
{
  const schema = s.number()
  type Type = Infer<typeof schema>

  // 1. Positive Test: Should compile
  const val: Type = 123
  assertType<number>(val)

  // 2. Negative Test: Should FAIL to compile
  // We use @ts-expect-error to tell the compiler "We expect this next line to explode"
  // If the line acts effectively (e.g. inference is too loose and allows strings),
  // @ts-expect-error will actually THROW an error saying "Unused @ts-expect-error directive".

  // @ts-expect-error - Type should not be string
  const bad: Type = '123'
}

// --- TEST 2: Objects ---
{
  const User = s.object({
    id: s.number(),
    name: s.string(),
  })
  type UserType = Infer<typeof User>

  // 1. Positive Test: Exact match
  const validUser: UserType = { id: 1, name: 'Alice' }

  // Double check it matches our manual interface expectation
  interface ExpectedUser {
    id: number
    name: string
  }
  assertType<ExpectedUser>(validUser)

  // 2. Negative Test: Missing keys
  // @ts-expect-error - Property 'name' is missing
  const missingKey: UserType = { id: 1 }

  // 3. Negative Test: Extra keys (Object literals in TS are strict)
  // @ts-expect-error - Object literal may only specify known properties
  const extraKey: UserType = { id: 1, name: 'Alice', isAdmin: true }
}

// --- TEST 3: Arrays ---
{
  const Tags = s.array(s.string())
  type TagType = Infer<typeof Tags>

  // 1. Positive
  const valid: TagType = ['a', 'b']
  assertType<string[]>(valid)

  // 2. Negative
  // @ts-expect-error - Type 'number' is not assignable to type 'string'
  const invalid: TagType = [1, 2]
}

// --- TEST 4: Optionality (The Phantom Type Check) ---
{
  const schema = s.object({
    required: s.string(),
    optional: s.string().optional(),
  })
  type PartialType = Infer<typeof schema>

  // 1. Positive: Omitted optional field
  // Note: In strict TS, optional properties in the TYPE (key?: val) vs
  // optional values (key: val | undefined) behave slightly differently.
  // Our library produces { optional: string | undefined }.
  // To allow KEY omission, the builder needs to return a Partial<T> or similar.
  // Based on our current "Tiny" implementation, we explicitly allow 'undefined' as a value.

  const withUndefined: PartialType = {
    required: 'a',
    optional: undefined,
  }

  const withValue: PartialType = {
    required: 'a',
    optional: 'b',
  }

  // 2. Negative
  // @ts-expect-error - Type 'number' is not assignable to 'string | undefined'
  const badType: PartialType = { required: 'a', optional: 123 }
}

// --- TEST 5: Nested Complex Types ---
{
  const Complex = s.object({
    users: s.array(
      s.object({
        id: s.number(),
      })
    ),
  })

  type ComplexType = Infer<typeof Complex>

  const valid: ComplexType = {
    users: [{ id: 1 }, { id: 2 }],
  }

  // @ts-expect-error - 'users' must be an array
  const badStruct: ComplexType = { users: { id: 1 } }
}

// --- TEST 6: String Format Extensions ---
{
  // 1. Basic Format Chaining
  const emailSchema = s.string().email()
  type EmailType = Infer<typeof emailSchema>

  const e: EmailType = 'test@example.com'
  assertType<string>(e)

  // @ts-expect-error - Should still be a string, not a number
  const badEmail: EmailType = 123

  // 2. Pattern (Regex) Chaining
  const patternSchema = s.string().pattern(/abc/)
  type PatternType = Infer<typeof patternSchema>

  const p: PatternType = 'abc'
  assertType<string>(p)

  // 3. Chaining Format + Optional
  // This verifies that .email() returns a builder that still has .optional()
  const optionalUuid = s.string().uuid().optional()
  type OptUuid = Infer<typeof optionalUuid>

  const u1: OptUuid = '123e4567-e89b-12d3-a456-426614174000'
  const u2: OptUuid = undefined

  assertType<string | undefined>(u1)
  assertType<string | undefined>(u2)

  // @ts-expect-error - Should not accept numbers
  const badUuid: OptUuid = 123
}

// --- TEST 7: Complex Nested Formats ---
{
  const APIRequest = s.object({
    id: s.string().uuid(),
    meta: s.object({
      ip: s.string().ipv4(),
      website: s.string().url().optional(),
    }),
    tags: s.array(s.string().pattern(/^[a-z]+$/)),
  })

  type RequestType = Infer<typeof APIRequest>

  const valid: RequestType = {
    id: 'uuid-string',
    meta: {
      ip: '127.0.0.1',
      website: undefined,
    },
    tags: ['tag', 'another'],
  }

  // @ts-expect-error - 'website' expects string | undefined, not number
  const invalid: RequestType = {
    id: 'uuid',
    meta: { ip: '0.0.0.0', website: 123 },
    tags: [],
  }
}

// --- TEST 8: Enums ---
{
  // 1. String Union Inference
  const Roles = s.enum(['admin', 'user'])
  type RoleType = Infer<typeof Roles>

  const r1: RoleType = 'admin' // OK
  const r2: RoleType = 'user' // OK
  assertType<'admin' | 'user'>(r1)

  // @ts-expect-error - "guest" is not in the union
  const r3: RoleType = 'guest'

  // 2. Number Union Inference
  const Ports = s.enum([80, 443, 8080])
  type PortType = Infer<typeof Ports>

  const p1: PortType = 80
  assertType<80 | 443 | 8080>(p1)

  // @ts-expect-error - 22 is not in the union
  const p2: PortType = 22

  // 3. Enum + Optional
  const Config = s.object({
    mode: s.enum(['dark', 'light']).optional(),
  })
  type ConfigType = Infer<typeof Config>

  const c1: ConfigType = { mode: 'dark' }
  const c2: ConfigType = { mode: undefined }

  // @ts-expect-error - "blue" is not in union
  const c3: ConfigType = { mode: 'blue' }
}
