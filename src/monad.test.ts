import { describe, test, expect } from 'bun:test'
import { s } from './schema'
import { M, createM, SchemaError, TimeoutError } from './monad'

describe('Monad (M)', () => {
  // 1. Define Schemas
  const NameS = s.object({ name: s.string.min(2) })
  const GreetingS = s.object({ greeting: s.string })
  const CountS = s.object({ count: s.number.min(0) })

  // 2. Define Logic
  const buildGreeting = M.func(NameS, GreetingS, (d) => ({
    greeting: `Hello, ${d.name}`,
  }))

  const countChars = M.func(GreetingS, CountS, (d) => ({
    count: d.greeting.length,
  }))

  const brokenFunction = M.func(NameS, GreetingS, (d) => ({
    greeting: 123 as any, // <--- Intentional Implementation Bug (Number not String)
  }))

  // 3. Create Registry
  const pipeline = createM({
    buildGreeting,
    countChars,
    brokenFunction,
  })

  test('Standalone M.func execution', async () => {
    // Valid
    const res = await buildGreeting({ name: 'Alice' })
    expect(res).toEqual({ greeting: 'Hello, Alice' })

    // Invalid Input (Throws)
    await expect(buildGreeting({ name: 'A' } as any)).rejects.toThrow(
      SchemaError
    )
  })

  test('Valid Chain Execution', async () => {
    // Chain: Name -> Greeting -> Count
    const result = await pipeline
      .buildGreeting({ name: 'Alice' })
      .countChars()
      .result()

    // "Hello, Alice" is 12 chars
    expect(result).toEqual({ count: 12 })
  })

  test('Chain Failure: Input Validation (Initial)', async () => {
    await expect(
      pipeline
        .buildGreeting({ name: 'A' }) // Invalid (min(2))
        .countChars()
        .result()
    ).rejects.toThrow("Input validation failed for 'buildGreeting'")
  })

  test('Chain Failure: Output Validation (Middle)', async () => {
    await expect(
      pipeline
        .brokenFunction({ name: 'Bob' })
        .countChars() // Should never run
        .result()
    ).rejects.toThrow("Output validation failed for 'brokenFunction'")
  })

  test('Type Safety (Runtime Check on Chain Link)', async () => {
    // We create a new generic M where types might overlap loosely
    // but data is technically wrong to ensure the "Guard" works between steps

    const AnyIn = s.object({ val: s.string })
    const AnyOut = s.object({ val: s.number })

    const step1 = M.func(AnyIn, AnyOut, () => ({ val: 100 }))

    // step2 expects a string, but step1 returns a number
    // Typescript would block this, but we force it at runtime to test the safety net
    const step2 = M.func(
      s.object({ val: s.string }),
      s.object({ ok: s.boolean }),
      () => ({ ok: true })
    )

    const badPipe = createM({ step1, step2 }) as any

    await expect(badPipe.step1({ val: 'start' }).step2().result()).rejects.toThrow(
      "Input validation failed for 'step2'"
    )
  })

  test('Manual Error Throwing in Function', async () => {
    const thrower = M.func(NameS, GreetingS, () => {
      throw new Error('Database disconnected')
    })

    const pipe = createM({ thrower })

    await expect(pipe.thrower({ name: 'Alice' }).result()).rejects.toThrow(
      'Database disconnected'
    )
  })

  test('Async Implementation Support', async () => {
    const asyncFn = M.func(NameS, GreetingS, async (d) => {
      await new Promise((r) => setTimeout(r, 1))
      return { greeting: `Async ${d.name}` }
    })

    const res = await asyncFn({ name: 'Bob' })
    expect(res).toEqual({ greeting: 'Async Bob' })
  })

  test('Timeout Support', async () => {
    const slowFn = M.func(
      NameS,
      GreetingS,
      async (d) => {
        await new Promise((r) => setTimeout(r, 20))
        return { greeting: `Slow ${d.name}` }
      },
      10 // timeoutMs
    )

    // Should timeout
    await expect(slowFn({ name: 'Bob' })).rejects.toThrow(TimeoutError)

    // Should timeout in pipeline
    const pipe = createM({ slowFn })
    await expect(pipe.slowFn({ name: 'Bob' }).result()).rejects.toThrow(
      "Function 'slowFn' timed out after 10ms"
    )
  })
})
