import { s, validate } from './src/schema'
import { z } from 'zod'

const ARRAY_SIZE = 1_000_000

console.log(
  `\n🔥 SETUP: Generating ${ARRAY_SIZE.toLocaleString()} complex union items...`
)

// We create a mix of two distinct types to force the union logic to work hard
// Type A: Simple number wrapper
// Type B: Object with optional string
const data = new Array(ARRAY_SIZE).fill(null).map((_, i) => {
  if (i % 2 === 0) {
    return { kind: 'simple', value: i }
  } else {
    // Every 4th item omits the optional field
    return {
      kind: 'complex',
      id: `id_${i}`,
      meta: i % 4 === 0 ? undefined : 'metadata_string',
    }
  }
})

// --- 1. DEFINE SCHEMAS ---

// TOSI (Schema-First)
const TosiSimple = s.object({
  kind: s.enum(['simple']),
  value: s.number,
})

const TosiComplex = s.object({
  kind: s.enum(['complex']),
  id: s.string,
  meta: s.string.optional, // Optional field
})

const TosiUnionArray = s.array(s.union([TosiSimple, TosiComplex]))

// ZOD (Parser-First)
const ZodSimple = z.object({
  kind: z.literal('simple'),
  value: z.number(),
})

const ZodComplex = z.object({
  kind: z.literal('complex'),
  id: z.string(),
  meta: z.string().optional(),
})

const ZodUnionArray = z.array(z.union([ZodSimple, ZodComplex]))

// --- 2. RUN BENCHMARK ---

console.log(`\n🥊 FIGHT! (Union + Optionality)\n`)

// TOSI
const startTosi = performance.now()
// This will check indices 0, 37, 74...
// It has to run the Union check on roughly ~27,000 items.
const tosiValid = validate(data, TosiUnionArray.schema)
const endTosi = performance.now()

// ZOD
const startZod = performance.now()
// This runs the Union check on 1,000,000 items.
const zodValid = ZodUnionArray.safeParse(data).success
const endZod = performance.now()

// --- 3. REPORT ---

const tosiTime = (endTosi - startTosi).toFixed(4)
const zodTime = (endZod - startZod).toFixed(4)
const multiplier = Math.floor(Number(zodTime) / Number(tosiTime))

console.log(
  `tosijs: ${tosiTime} ms  (${tosiValid ? '✅ Valid' : '❌ Invalid'})`
)
console.log(`zod:    ${zodTime} ms  (${zodValid ? '✅ Valid' : '❌ Invalid'})`)
console.log(`\n🚀 Speed Factor: ${multiplier}x faster`)
