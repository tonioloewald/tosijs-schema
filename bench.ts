import { s, validate } from './src/schema'
import { z } from 'zod'

const ARRAY_SIZE = 1_000_000
const OBJECT_KEYS = 100_000

const fmt = (n: number) => n.toFixed(4) + ' ms'
const heading = (str: string) => console.log(`\n👉 ${str}`)

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

console.log(`\n🔥 GENERATING DATA...`)

console.log(`   - Array:  ${ARRAY_SIZE.toLocaleString()} items (Complex Union)`)
const arrayData = new Array(ARRAY_SIZE).fill(null).map((_, i) => makeItem(i))

console.log(
  `   - Object: ${OBJECT_KEYS.toLocaleString()} keys  (Complex Union)`
)
const objectData: Record<string, any> = {}
for (let i = 0; i < OBJECT_KEYS; i++) {
  const key = (i + 9_000_000_000_000).toString(36)
  objectData[key] = makeItem(i)
}

// --- SCHEMA DEFINITIONS ---

// 1. TOSI
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

// 2. ZOD
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

// --- ROUND 1: ARRAYS ---

heading('ROUND 1: Huge Array (Complex Union)')

// 1A. Tosi Skip
const a1_start = performance.now()
const a1_valid = validate(arrayData, TosiArr.schema)
const a1_end = performance.now()

// 1B. Tosi Full
const a2_start = performance.now()
const a2_valid = validate(arrayData, TosiArr.schema, { fullScan: true })
const a2_end = performance.now()

// 1C. Zod
const a3_start = performance.now()
const a3_valid = ZodArr.safeParse(arrayData).success
const a3_end = performance.now()

const resArr = {
  opt: a1_end - a1_start,
  full: a2_end - a2_start,
  zod: a3_end - a3_start,
}

console.log(`   Tosi (Skip): ${fmt(resArr.opt)}   (${a1_valid ? '✅' : '❌'})`)
console.log(`   Tosi (Full): ${fmt(resArr.full)}   (${a2_valid ? '✅' : '❌'})`)
console.log(`   Zod:         ${fmt(resArr.zod)}   (${a3_valid ? '✅' : '❌'})`)
console.log(`   ----------------------------------`)
console.log(
  `   🚀 vs Zod: ${(resArr.zod / resArr.opt).toFixed(1)}x faster (Optimized)`
)
console.log(
  `   🏎️  vs Zod: ${(resArr.zod / resArr.full).toFixed(
    1
  )}x faster (Raw Engine Speed)`
)

// --- ROUND 2: OBJECTS ---

heading('ROUND 2: Huge Object (Complex Union)')

// 2A. Tosi Skip
const o1_start = performance.now()
const o1_valid = validate(objectData, TosiDict.schema)
const o1_end = performance.now()

// 2B. Tosi Full
const o2_start = performance.now()
const o2_valid = validate(objectData, TosiDict.schema, { fullScan: true })
const o2_end = performance.now()

// 2C. Zod
const o3_start = performance.now()
const o3_valid = ZodDict.safeParse(objectData).success
const o3_end = performance.now()

const resObj = {
  opt: o1_end - o1_start,
  full: o2_end - o2_start,
  zod: o3_end - o3_start,
}

console.log(`   Tosi (Skip): ${fmt(resObj.opt)}    (${o1_valid ? '✅' : '❌'})`)
console.log(`   Tosi (Full): ${fmt(resObj.full)}   (${o2_valid ? '✅' : '❌'})`)
console.log(`   Zod:         ${fmt(resObj.zod)}   (${o3_valid ? '✅' : '❌'})`)
console.log(`   ----------------------------------`)
console.log(
  `   🚀 vs Zod: ${(resObj.zod / resObj.opt).toFixed(1)}x faster (Optimized)`
)
console.log(
  `   🏎️  vs Zod: ${(resObj.zod / resObj.full).toFixed(
    1
  )}x faster (Raw Engine Speed)`
)
console.log(`\n`)
