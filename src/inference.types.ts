/*
IMPORTANT
This file checks TypeScript compilation behavior.
It uses @ts-expect-error to assert that invalid types cause compile errors.
*/

import { s, type Infer } from './schema'
import { M, createM } from './monad'

function assertType<Expected>(value: Expected) {
  /* no-op */
}

// --- TEST 1: Primitives ---
{
  const schema = s.number
  type Type = Infer<typeof schema>
  assertType<number>(123)
  // @ts-expect-error - Type should not be string
  const bad: Type = '123'
}

// --- TEST 2: Objects ---
{
  const User = s.object({ id: s.number, name: s.string })
  type UserType = Infer<typeof User>
  assertType<{ id: number; name: string }>({ id: 1, name: 'Alice' })

  // @ts-expect-error - Property 'name' is missing
  const missingKey: UserType = { id: 1 }

  const extraKey: UserType = {
    id: 1,
    name: 'Alice',
    // @ts-expect-error - Excess property 'isAdmin'
    isAdmin: true,
  }
}

// --- TEST 3: Arrays ---
{
  const Tags = s.array(s.string)
  type TagType = Infer<typeof Tags>
  assertType<string[]>(['a', 'b'])

  const invalid: TagType = [
    // @ts-expect-error - number not assignable to string
    1, 2,
  ]
}

// --- TEST 4: Optionality ---
{
  const schema = s.object({ req: s.string, opt: s.string.optional })
  type PartialType = Infer<typeof schema>

  const val1: PartialType = { req: 'a', opt: undefined }
  const val2: PartialType = { req: 'a' } // Implicit undefined

  const bad: PartialType = {
    req: 'a',
    // @ts-expect-error - number not assignable
    opt: 123,
  }
}

// --- TEST 5: Nested ---
{
  const Complex = s.object({ users: s.array(s.object({ id: s.number })) })
  type ComplexType = Infer<typeof Complex>

  const badStruct: ComplexType = {
    // @ts-expect-error - 'users' must be an array
    users: { id: 1 },
  }
}

// --- TEST 6: Formats ---
{
  const emailSchema = s.string.email
  type EmailType = Infer<typeof emailSchema>
  assertType<string>('a@b.com')

  // @ts-expect-error - number not assignable
  const bad: EmailType = 123
}

// --- TEST 7: Enums ---
{
  const Roles = s.enum(['admin', 'user'])
  type RoleType = Infer<typeof Roles>
  assertType<'admin' | 'user'>('admin')

  // @ts-expect-error - 'guest' not assignable
  const r3: RoleType = 'guest'
}

// --- TEST 8: Unions ---
{
  const ID = s.union([s.string, s.number])
  type IdType = Infer<typeof ID>
  assertType<string | number>('abc')

  // @ts-expect-error - boolean not assignable
  const badId: IdType = true

  // Object Union
  const Cat = s.object({ type: s.enum(['cat']), meow: s.boolean })
  const Dog = s.object({ type: s.enum(['dog']), bark: s.boolean })
  const Pet = s.union([Cat, Dog])
  type PetType = Infer<typeof Pet>

  const badPet: PetType = {
    type: 'dog',
    // @ts-expect-error - 'bark' must be boolean (Type Mismatch is stricter than Excess Property)
    bark: 123,
  }
}

// --- TEST 9: The Lie ---
{
  // @ts-expect-error - .int does not exist on string
  const badString = s.string.int
}

// --- TEST 10: Tuples ---
{
  const Point = s.tuple([s.number, s.number])
  type PointType = Infer<typeof Point>

  const p2: PointType = [
    10,
    // @ts-expect-error - Type 'string' is not assignable to type 'number'
    '20',
  ]

  // @ts-expect-error - Source has 1 element but target requires 2
  const p3: PointType = [10]
}

// --- TEST 11: Tuple in Array ---
{
  const Path = s.array(s.tuple([s.number, s.number]))
  type PathType = Infer<typeof Path>

  const invalidPath: PathType = [
    [0, 0],
    // @ts-expect-error - Type 'string' is not assignable to type 'number'
    [10, '20'],
  ]
}

// --- TEST 12: Static Type Inference ---
{
  const schema = s.object({
    email: s.email,
    count: s.integer,
    flag: s.boolean,
  })
  type DataType = Infer<typeof schema>

  const badInt: DataType = {
    email: 'a',
    // @ts-expect-error - Type 'string' is not assignable to type 'number'
    count: '10',
    flag: true,
  }
}

// --- TEST 13: Optional First-Class ---
{
  const schema = s.object({ optInt: s.integer.optional })
  type DataType = Infer<typeof schema>

  const valid: DataType = {}

  const bad: DataType = {
    // @ts-expect-error - Type 'string' is not assignable to type 'number | undefined'
    optInt: '5',
  }
}

// --- TEST 14: Monadic Inference ---
{
  // 1. M.func Argument Inference
  // We do NOT explicitly type (str), TS should infer it from s.string
  const len = M.func(s.string, s.number, (str) => {
    assertType<string>(str)

    // @ts-expect-error - Property 'toFixed' does not exist on type 'string'
    str.toFixed(2)

    return str.length
  })

  // 2. M.func Return Type Safety
  // @ts-expect-error - Argument of type 'string' is not assignable to parameter of type 'number'
  len(123)

  const result: Promise<number> = len('hello')

  // 3. M.func Implementation Verification
  // @ts-expect-error - 'number' is not assignable to type 'boolean'
  M.func(s.string, s.boolean, (str) => {
    return 123
  })

  // 4. Chain Builder Inference
  const isEven = M.func(s.number, s.boolean, (n) => n % 2 === 0)
  const toUpper = M.func(s.string, s.string, (s) => s.toUpperCase())

  const pipeline = createM({
    len,
    isEven,
    toUpper,
  })

  // Valid Chain
  // len returns number -> isEven accepts number. OK.
  const valid = pipeline.len('abc').isEven().result()
  assertType<Promise<boolean>>(valid)

  // Invalid Start
  // @ts-expect-error - Argument of type 'number' is not assignable to parameter of type 'string'
  pipeline.len(123)

  // Invalid Chain Link (Type Mismatch)
  // len returns number. toUpper expects string.
  // The 'toUpper' property should be type 'never' on the chain.
  pipeline
    .len('abc')
    // @ts-expect-error - This expression is not callable. Type 'never' has no call signatures.
    .toUpper()
}

// --- TEST 15: s.any ---
{
  const schema = s.any
  type AnyType = Infer<typeof schema>

  // Should accept absolutely anything
  assertType<any>('hello')
  assertType<any>(123)
  assertType<any>({ complex: [1, 2] })
  assertType<any>(null)
  assertType<any>(undefined)

  const val: AnyType = { a: 1 }
  // Verify it behaves like TS 'any'
  val.nonExistentProp = 2 // Should compile
}
