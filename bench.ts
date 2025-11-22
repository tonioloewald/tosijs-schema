import { s, validate } from './src/schema'
import { z } from 'zod'

const ARRAY_SIZE = 1_000_000
const OBJECT_KEYS = 100_000

const fmt = (n: number) => n.toFixed(4) + ' ms'

// --- DATA GENERATORS ---

const makeMsg = (i: number) => ({
  type: 'msg',
  text: `Hello ${i}`,
  timestamp: i,
})
const makeImg = (i: number) => ({
  type: 'img',
  url: 'http://...',
  size: { w: 100, h: 200 },
})
const makeReply = (i: number) => ({
  type: 'reply',
  original_id: 'xyz',
  text: 'cool',
  thread: i,
})

const makeItem = (i: number) => {
  const m = i % 3
  return m === 0 ? makeMsg(i) : m === 1 ? makeImg(i) : makeReply(i)
}

console.log(`\n📦 GENERATING DATA...`)
const arrayData = new Array(ARRAY_SIZE).fill(null).map((_, i) => makeItem(i))

const objectData: Record<string, any> = {}
for (let i = 0; i < OBJECT_KEYS; i++) {
  const key = (i + 9_000_000_000_000).toString(36)
  objectData[key] = makeItem(i)
}

// --- SCHEMA DEFINITIONS ---

// TOSI
const T_Msg = s.object({
  type: s.enum(['msg']),
  text: s.string,
  timestamp: s.number,
})
const T_Img = s.object({
  type: s.enum(['img']),
  url: s.string,
  size: s.object({ w: s.number, h: s.number }),
})
const T_Reply = s.object({
  type: s.enum(['reply']),
  original_id: s.string,
  text: s.string,
  thread: s.number,
})
const TosiUnion = s.union([T_Msg, T_Img, T_Reply])
const TosiArr = s.array(TosiUnion)
const TosiDict = s.record(TosiUnion)

// ZOD
const Z_Msg = z.object({
  type: z.literal('msg'),
  text: z.string(),
  timestamp: z.number(),
})
const Z_Img = z.object({
  type: z.literal('img'),
  url: z.string(),
  size: z.object({ w: z.number(), h: z.number() }),
})
const Z_Reply = z.object({
  type: z.literal('reply'),
  original_id: z.string(),
  text: z.string(),
  thread: z.number(),
})
const ZodUnion = z.union([Z_Msg, Z_Img, Z_Reply])
const ZodArr = z.array(ZodUnion)
const ZodDict = z.record(z.string(), ZodUnion)

// --- BENCHMARK RUNNER ---

function runSuite(label: string) {
  console.log(`\n👉 ${label}`)

  // 1. ARRAY
  const a1_start = performance.now()
  validate(arrayData, TosiArr.schema)
  const a1_end = performance.now()

  const a2_start = performance.now()
  validate(arrayData, TosiArr.schema, { fullScan: true })
  const a2_end = performance.now()

  const a3_start = performance.now()
  ZodArr.safeParse(arrayData)
  const a3_end = performance.now()

  const rArr = {
    skip: a1_end - a1_start,
    full: a2_end - a2_start,
    zod: a3_end - a3_start,
  }

  console.log(`   [Array 1M] Tosi (Skip): ${fmt(rArr.skip)}`)
  console.log(`   [Array 1M] Tosi (Full): ${fmt(rArr.full)}`)
  console.log(`   [Array 1M] Zod:         ${fmt(rArr.zod)}`)
  console.log(`   ----------------------------------`)
  console.log(
    `   🚀 vs Zod: ${(rArr.zod / rArr.skip).toFixed(1)}x faster (Optimized)`
  )
  console.log(
    `   🏎️  vs Zod: ${(rArr.zod / rArr.full).toFixed(1)}x faster (Raw Speed)`
  )
  console.log(``)

  // 2. OBJECT
  const o1_start = performance.now()
  validate(objectData, TosiDict.schema)
  const o1_end = performance.now()

  const o2_start = performance.now()
  validate(objectData, TosiDict.schema, { fullScan: true })
  const o2_end = performance.now()

  const o3_start = performance.now()
  ZodDict.safeParse(objectData)
  const o3_end = performance.now()

  const rObj = {
    skip: o1_end - o1_start,
    full: o2_end - o2_start,
    zod: o3_end - o3_start,
  }

  console.log(`   [Dict 100k] Tosi (Skip): ${fmt(rObj.skip)}`)
  console.log(`   [Dict 100k] Tosi (Full): ${fmt(rObj.full)}`)
  console.log(`   [Dict 100k] Zod:         ${fmt(rObj.zod)}`)
  console.log(`   ----------------------------------`)
  console.log(
    `   🚀 vs Zod: ${(rObj.zod / rObj.skip).toFixed(1)}x faster (Optimized)`
  )
  console.log(
    `   🏎️  vs Zod: ${(rObj.zod / rObj.full).toFixed(1)}x faster (Raw Speed)`
  )
}

// --- EXECUTION ---

console.log(`\n❄️  PHASE 1: COLD START (Simulating Serverless / CLI) ❄️`)
runSuite('Cold Run')

console.log(`\n\n👟 WARMING UP JIT...`)
const warmData = arrayData.slice(0, 1000)
// Run enough iterations to force TurboFan optimization (usually >5k calls)
for (let i = 0; i < 10000; i++) {
  validate(warmData, TosiArr.schema)
  validate(warmData, TosiArr.schema, { fullScan: true })
  ZodArr.safeParse(warmData)
}
console.log(`   (Engine is hot)`)

console.log(`\n\n🔥 PHASE 2: HOT JIT (Simulating Long-Running Server) 🔥`)
runSuite('Hot Run')
