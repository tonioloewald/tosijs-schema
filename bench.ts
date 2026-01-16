import { s, validate, filter } from './src/schema'
import { z } from 'zod'
import { Type, Kind, type Static } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { Value } from '@sinclair/typebox/value'

// --- TYPEBOX RUNTIME SCHEMA HELPER ---
// Injects TypeBox Kind symbols into plain JSON Schema so TypeBox can process it
function injectTypeBoxKind(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(injectTypeBoxKind)

  const result = { ...schema }

  if (schema.type === 'object') {
    result[Kind] = 'Object'
    if (schema.properties) {
      result.properties = {}
      for (const [key, prop] of Object.entries(schema.properties)) {
        result.properties[key] = injectTypeBoxKind(prop)
      }
    }
    if (schema.additionalProperties !== undefined) {
      result.additionalProperties = injectTypeBoxKind(schema.additionalProperties)
    }
  } else if (schema.type === 'string') {
    result[Kind] = 'String'
  } else if (schema.type === 'number') {
    result[Kind] = 'Number'
  } else if (schema.type === 'integer') {
    result[Kind] = 'Integer'
  } else if (schema.type === 'boolean') {
    result[Kind] = 'Boolean'
  } else if (schema.type === 'array') {
    result[Kind] = 'Array'
    if (schema.items) {
      result.items = injectTypeBoxKind(schema.items)
    }
  } else if (schema.type === 'null') {
    result[Kind] = 'Null'
  } else if (schema.anyOf) {
    result[Kind] = 'Union'
    result.anyOf = schema.anyOf.map(injectTypeBoxKind)
  } else if (schema.enum) {
    result[Kind] = 'Union'
    result.anyOf = schema.enum.map((v: any) => ({ [Kind]: 'Literal', const: v }))
    delete result.enum
  } else if (schema.const !== undefined) {
    result[Kind] = 'Literal'
  }

  return result
}

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

// TYPEBOX
const TB_Msg = Type.Object({
  type: Type.Literal('msg'),
  text: Type.String(),
  timestamp: Type.Number(),
})
const TB_Img = Type.Object({
  type: Type.Literal('img'),
  url: Type.String(),
  size: Type.Object({ w: Type.Number(), h: Type.Number() }),
})
const TB_Reply = Type.Object({
  type: Type.Literal('reply'),
  original_id: Type.String(),
  text: Type.String(),
  thread: Type.Number(),
})
const TypeBoxUnion = Type.Union([TB_Msg, TB_Img, TB_Reply])
const TypeBoxArr = Type.Array(TypeBoxUnion)
const TypeBoxDict = Type.Record(Type.String(), TypeBoxUnion)

// TypeBox JIT-compiled validators
const TypeBoxArrCompiled = TypeCompiler.Compile(TypeBoxArr)
const TypeBoxDictCompiled = TypeCompiler.Compile(TypeBoxDict)

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

  // TypeBox interpreted (Value.Check)
  const a4_start = performance.now()
  Value.Check(TypeBoxArr, arrayData)
  const a4_end = performance.now()

  // TypeBox JIT compiled (TypeCompiler)
  const a5_start = performance.now()
  TypeBoxArrCompiled.Check(arrayData)
  const a5_end = performance.now()

  const rArr = {
    skip: a1_end - a1_start,
    full: a2_end - a2_start,
    zod: a3_end - a3_start,
    tbInterp: a4_end - a4_start,
    tbJit: a5_end - a5_start,
  }

  console.log(`   [Array 1M] Tosi (Skip):      ${fmt(rArr.skip)}`)
  console.log(`   [Array 1M] Tosi (Full):      ${fmt(rArr.full)}`)
  console.log(`   [Array 1M] Zod:              ${fmt(rArr.zod)}`)
  console.log(`   [Array 1M] TypeBox (Interp): ${fmt(rArr.tbInterp)}`)
  console.log(`   [Array 1M] TypeBox (JIT):    ${fmt(rArr.tbJit)}`)
  console.log(`   ----------------------------------`)
  console.log(
    `   🚀 Tosi (Skip) vs Zod:        ${(rArr.zod / rArr.skip).toFixed(1)}x faster`
  )
  console.log(
    `   🏎️  Tosi (Full) vs Zod:        ${(rArr.zod / rArr.full).toFixed(1)}x faster`
  )
  const skipVsTbJit = rArr.tbJit / rArr.skip
  const fullVsTbJit = rArr.tbJit / rArr.full
  console.log(
    `   ⚡ Tosi (Skip) vs TypeBox JIT: ${skipVsTbJit >= 1 ? skipVsTbJit.toFixed(1) + 'x faster' : (1 / skipVsTbJit).toFixed(1) + 'x slower'}`
  )
  console.log(
    `   🔥 Tosi (Full) vs TypeBox JIT: ${fullVsTbJit >= 1 ? fullVsTbJit.toFixed(1) + 'x faster' : (1 / fullVsTbJit).toFixed(1) + 'x slower'}`
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

  // TypeBox interpreted (Value.Check)
  const o4_start = performance.now()
  Value.Check(TypeBoxDict, objectData)
  const o4_end = performance.now()

  // TypeBox JIT compiled (TypeCompiler)
  const o5_start = performance.now()
  TypeBoxDictCompiled.Check(objectData)
  const o5_end = performance.now()

  const rObj = {
    skip: o1_end - o1_start,
    full: o2_end - o2_start,
    zod: o3_end - o3_start,
    tbInterp: o4_end - o4_start,
    tbJit: o5_end - o5_start,
  }

  console.log(`   [Dict 100k] Tosi (Skip):      ${fmt(rObj.skip)}`)
  console.log(`   [Dict 100k] Tosi (Full):      ${fmt(rObj.full)}`)
  console.log(`   [Dict 100k] Zod:              ${fmt(rObj.zod)}`)
  console.log(`   [Dict 100k] TypeBox (Interp): ${fmt(rObj.tbInterp)}`)
  console.log(`   [Dict 100k] TypeBox (JIT):    ${fmt(rObj.tbJit)}`)
  console.log(`   ----------------------------------`)
  console.log(
    `   🚀 Tosi (Skip) vs Zod:        ${(rObj.zod / rObj.skip).toFixed(1)}x faster`
  )
  console.log(
    `   🏎️  Tosi (Full) vs Zod:        ${(rObj.zod / rObj.full).toFixed(1)}x faster`
  )
  const oSkipVsTbJit = rObj.tbJit / rObj.skip
  const oFullVsTbJit = rObj.tbJit / rObj.full
  console.log(
    `   ⚡ Tosi (Skip) vs TypeBox JIT: ${oSkipVsTbJit >= 1 ? oSkipVsTbJit.toFixed(1) + 'x faster' : (1 / oSkipVsTbJit).toFixed(1) + 'x slower'}`
  )
  console.log(
    `   🔥 Tosi (Full) vs TypeBox JIT: ${oFullVsTbJit >= 1 ? oFullVsTbJit.toFixed(1) + 'x faster' : (1 / oFullVsTbJit).toFixed(1) + 'x slower'}`
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
  Value.Check(TypeBoxArr, warmData)
  TypeBoxArrCompiled.Check(warmData)
}
console.log(`   (Engine is hot)`)

console.log(`\n\n🔥 PHASE 2: HOT JIT (Simulating Long-Running Server) 🔥`)
runSuite('Hot Run')

// --- FILTER BENCHMARK ---
console.log(`\n\n🧹 FILTER BENCHMARK 🧹`)

const FILTER_SIZE = 10_000
const filterData = new Array(FILTER_SIZE).fill(null).map((_, i) => ({
  ...makeItem(i),
  extraField1: 'should be removed',
  extraField2: { nested: 'garbage' },
  debug: true,
}))

const f1_start = performance.now()
const filtered = filter(filterData, TosiArr.schema)
const f1_end = performance.now()

const f2_start = performance.now()
filter(filterData, TosiArr.schema, { skipValidation: true })
const f2_end = performance.now()

const f3_start = performance.now()
filter(filterData, TosiArr.schema, { fullScan: true })
const f3_end = performance.now()

console.log(`   [Array 10k] filter (default):        ${fmt(f1_end - f1_start)}`)
console.log(`   [Array 10k] filter (skipValidation): ${fmt(f2_end - f2_start)}`)
console.log(`   [Array 10k] filter (fullScan):       ${fmt(f3_end - f3_start)}`)
console.log(`   Filtered ${filtered instanceof Error ? 'ERROR' : filtered.length} items`)

// --- RUNTIME SCHEMA BENCHMARK ---
console.log(`\n\n🔄 RUNTIME SCHEMA BENCHMARK 🔄`)
console.log(`   (Validating against a schema received as plain JSON at runtime)`)

// Simulate receiving schema over the wire - use JSON parse to strip any symbols
const runtimeSchema = JSON.parse(JSON.stringify(TosiArr.schema))
const RUNTIME_SIZE = 100_000
const runtimeData = new Array(RUNTIME_SIZE).fill(null).map((_, i) => makeItem(i))

// tosijs-schema: works directly
const r1_start = performance.now()
validate(runtimeData, runtimeSchema)
const r1_end = performance.now()

const r2_start = performance.now()
validate(runtimeData, runtimeSchema, { strict: true })
const r2_end = performance.now()

// TypeBox: requires Kind injection first
const r3_start = performance.now()
const injectedSchema = injectTypeBoxKind(runtimeSchema)
const r3_end = performance.now()

const r4_start = performance.now()
Value.Check(injectedSchema, runtimeData)
const r4_end = performance.now()

// TypeBox: JIT compile the injected schema
const r5_start = performance.now()
const runtimeCompiled = TypeCompiler.Compile(injectedSchema)
const r5_end = performance.now()

const r6_start = performance.now()
runtimeCompiled.Check(runtimeData)
const r6_end = performance.now()

console.log(``)
console.log(`   [Array 100k] Tosi (direct):              ${fmt(r1_end - r1_start)}`)
console.log(`   [Array 100k] Tosi (strict):              ${fmt(r2_end - r2_start)}`)
console.log(`   [Array 100k] TypeBox Kind injection:     ${fmt(r3_end - r3_start)}`)
console.log(`   [Array 100k] TypeBox (Interp, injected): ${fmt(r4_end - r4_start)}`)
console.log(`   [Array 100k] TypeBox JIT compile:        ${fmt(r5_end - r5_start)}`)
console.log(`   [Array 100k] TypeBox (JIT, injected):    ${fmt(r6_end - r6_start)}`)
console.log(`   ----------------------------------`)
console.log(`   Total TypeBox runtime overhead:          ${fmt((r3_end - r3_start) + (r5_end - r5_start))} (injection + compile)`)
console.log(``)
console.log(`   Note: Zod cannot validate against runtime JSON schemas at all.`)
