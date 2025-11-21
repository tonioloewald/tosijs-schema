/*
IMPORTANT

This file checks TypeScript compilation behavior.
It uses @ts-expect-error to assert that invalid types cause compile errors.
If inference is too loose (allowing bad types), these directives will fail.
*/

import { s, type Infer } from './schema'

// --- HELPER: The "Type Assert" Function ---
function assertType<Expected>(value: Expected) {
  // no-op
}

// --- TEST 1: Primitives (Property Access) ---
{
  // UPDATED: No parens on primitives
  const schema = s.number
  type Type = Infer<typeof schema>

  // 1. Positive Test
  const val: Type = 123
  assertType<number>(val)

  // 2. Negative Test
  // @ts-expect-error - Type should not be string
  const bad: Type = '123'
}

// --- TEST 2: Objects ---
{
  const User = s.object({
    id: s.number, // UPDATED: s.number instead of s.number()
    name: s.string, // UPDATED: s.string instead of s.string()
  })
  type UserType = Infer<typeof User>

  // 1. Positive Test
  const validUser: UserType = { id: 1, name: 'Alice' }

  interface ExpectedUser {
    id: number
    name: string
  }
  assertType<ExpectedUser>(validUser)

  // 2. Negative Test: Missing keys
  // @ts-expect-error - Property 'name' is missing
  const missingKey: UserType = { id: 1 }

  // 3. Negative Test: Extra keys
  // @ts-expect-error - Object literal may only specify known properties
  const extraKey: UserType = { id: 1, name: 'Alice', isAdmin: true }
}

// --- TEST 3: Arrays ---
{
  const Tags = s.array(s.string) // UPDATED
  type TagType = Infer<typeof Tags>

  // 1. Positive
  const valid: TagType = ['a', 'b']
  assertType<string[]>(valid)

  // 2. Negative
  // @ts-expect-error - Type 'number' is not assignable to type 'string'
  const invalid: TagType = [1, 2]
}

// --- TEST 4: Optionality ---
{
  const schema = s.object({
    required: s.string,
    // Chaining .optional() off the property
    optional: s.string.optional,
  })
  type PartialType = Infer<typeof schema>

  const withUndefined: PartialType = {
    required: 'a',
    optional: undefined,
  }

  const withValue: PartialType = {
    required: 'a',
    optional: 'b',
  }

  // @ts-expect-error - Type 'number' is not assignable to 'string | undefined'
  const badType: PartialType = { required: 'a', optional: 123 }
}

// --- TEST 5: Nested Complex Types ---
{
  const Complex = s.object({
    users: s.array(
      s.object({
        id: s.number,
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
  // Method chaining works directly off the property
  const emailSchema = s.string.email
  type EmailType = Infer<typeof emailSchema>

  const e: EmailType = 'test@example.com'
  assertType<string>(e)

  // @ts-expect-error - Should still be a string
  const badEmail: EmailType = 123

  const patternSchema = s.string.pattern(/abc/)
  type PatternType = Infer<typeof patternSchema>
  assertType<string>('abc')

  // Chaining Format + Optional
  const optionalUuid = s.string.uuid.optional
  type OptUuid = Infer<typeof optionalUuid>

  const u1: OptUuid = '123e4567-e89b-12d3-a456-426614174000'
  const u2: OptUuid = undefined

  assertType<string | undefined>(u1)
}

// --- TEST 7: Enums ---
{
  const Roles = s.enum(['admin', 'user'])
  type RoleType = Infer<typeof Roles>

  const r1: RoleType = 'admin'
  assertType<'admin' | 'user'>(r1)

  // @ts-expect-error - "guest" is not in the union
  const r3: RoleType = 'guest'

  const Ports = s.enum([80, 443])
  type PortType = Infer<typeof Ports>
  assertType<80 | 443>(80)
}

// --- TEST 8: Unions (NEW) ---
{
  // 1. Primitive Union
  const ID = s.union([s.string, s.number])
  type IdType = Infer<typeof ID>

  const sId: IdType = 'abc'
  const nId: IdType = 123

  assertType<string | number>(sId)

  // @ts-expect-error - boolean is not in string | number
  const badId: IdType = true

  // 2. Object Union (Discriminated Union)
  const Cat = s.object({ type: s.enum(['cat']), meow: s.boolean })
  const Dog = s.object({ type: s.enum(['dog']), bark: s.boolean })

  const Pet = s.union([Cat, Dog])
  type PetType = Infer<typeof Pet>

  const cat: PetType = { type: 'cat', meow: true }
  const dog: PetType = { type: 'dog', bark: true }

  // @ts-expect-error - Dog cannot meow
  const badPet: PetType = { type: 'dog', meow: true }

  // @ts-expect-error - Missing discriminant
  const incomplete: PetType = { bark: true }
}

// --- TEST 9: "The Lie" (Strict API Safety) ---
// These tests prove that the TypeScript interface hides methods
// that technically exist on the runtime "Universal Builder".
{
  // 1. String should not have .int()
  // @ts-expect-error - Property 'int' does not exist on type 'Str<string>'
  const badString = s.string.int

  // 2. Number should not have .email()
  // @ts-expect-error - Property 'email' does not exist on type 'Num<number>'
  const badNumber = s.number.email

  // 3. Boolean should not have .min()
  // @ts-expect-error - Property 'min' does not exist on type 'Base<boolean>'
  const badBool = s.boolean.min(1)
}

// --- TEST 10: Tuples (Fixed Length & Mixed Types) ---
{
  // 1. Homogeneous Tuple (Coordinates)
  const Point = s.tuple([s.number, s.number])
  type PointType = Infer<typeof Point>

  const p1: PointType = [10, 20]
  assertType<[number, number]>(p1)

  // @ts-expect-error - Type mismatch at index 1
  const p2: PointType = [10, '20']

  // @ts-expect-error - Length mismatch (Too short)
  const p3: PointType = [10]

  // @ts-expect-error - Length mismatch (Too long)
  const p4: PointType = [10, 20, 30]

  // 2. Heterogeneous Tuple (CSV Row style)
  const UserRow = s.tuple([
    s.number, // ID
    s.string, // Name
    s.boolean.optional, // IsActive?
  ])
  type RowType = Infer<typeof UserRow>

  const r1: RowType = [1, 'Alice', true]
  const r2: RowType = [2, 'Bob', undefined]

  assertType<[number, string, boolean | undefined]>(r1)

  // @ts-expect-error - Order matters (Boolean at index 1 is wrong)
  const r3: RowType = [1, true, 'Alice']
}

// --- TEST 11: Tuple inside Array (Matrix/Grid) ---
{
  // Array of [x, y] coordinates
  const Path = s.array(s.tuple([s.number, s.number]))
  type PathType = Infer<typeof Path>

  const validPath: PathType = [
    [0, 0],
    [10, 20],
    [15, 30],
  ]
  assertType<[number, number][]>(validPath)

  // @ts-expect-error - One element is not a valid tuple
  const invalidPath: PathType = [
    [0, 0],
    [10, '20'],
  ]
}
