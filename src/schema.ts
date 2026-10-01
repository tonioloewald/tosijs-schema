// THE TRUTH
import {
  RX_EMOJI_ATOM,
  FORMAT_VALIDATORS as FMT,
  ENFORCED_FORMATS,
  compilePattern,
} from './formats.js'

// re-export so existing consumers of `ENFORCED_FORMATS` from 'tosijs-schema' keep working
export { ENFORCED_FORMATS }

/**
 * Brand carried by every builder (`create` below). `Symbol.for`, so builders
 * from two installed copies of tosijs-schema recognise each other. Wire data
 * cannot forge it: JSON has no symbols, and `JSON.stringify` drops it.
 */
export const BUILDER: symbol = Symbol.for('tosijs-schema.builder')

/**
 * Is `x` a builder? A FACT, not a guess: the brand, or — for builders made by
 * a pre-1.12 copy that predates the brand — a callable `validate` beside
 * `schema`. Neither can arrive over the wire (JSON carries no symbols and no
 * functions), which is the property that matters.
 */
export const isBuilder = (x: any): boolean =>
  x != null &&
  typeof x === 'object' &&
  (x[BUILDER] === true || typeof x.validate === 'function') &&
  'schema' in x

// `optional` rides on the BUILDER, never inside the schema JSON — so it never
// leaks into serialized/published output. It carries forward through every
// chaining method (order-independent: s.any.optional.describe(x) and
// s.any.describe(x).optional both stay optional).
const create = (s: any, optional = false): any => ({
  [BUILDER]: true,
  schema: s,
  _type: null as any,
  _optional: optional,
  validate: (data: any, opts?: any) => validateResolved(data, s, opts),

  // --- Modifiers ---
  get optional() {
    // null-allowance must live in whatever constraint the schema actually
    // uses: type gains 'null', const becomes a typed enum listing null,
    // anyOf gains a null branch, enum lists null. Typeless schemas
    // (e.g. s.any) get no type key at all — s.object() reads the builder's
    // _optional flag, so never place undefined in a type array or leak a
    // marker into the schema.
    const out: any = { ...s }
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type]
      out.type = types.includes('null') ? types : [...types, 'null']
    }
    if (out.const !== undefined) {
      const constType = out.const === null ? 'null' : typeof out.const
      out.enum = [out.const, null]
      delete out.const
      if (out.type === undefined && constType !== 'null') {
        out.type = [constType, 'null']
      }
    }
    if (Array.isArray(out.enum) && !out.enum.includes(null)) {
      out.enum = [...out.enum, null]
    }
    if (
      out.type === undefined &&
      out.enum === undefined &&
      Array.isArray(out.anyOf) &&
      !out.anyOf.some(
        (branch: any) =>
          branch === true ||
          branch?.type === 'null' ||
          (Array.isArray(branch?.type) && branch.type.includes('null'))
      )
    ) {
      out.anyOf = [...out.anyOf, { type: 'null' }]
    }
    return create(out, true)
  },

  // keep the named fields, admit unknown ones (for protocols you don't own).
  // Object-only in meaning; harmless elsewhere. Removing a key is filter()'s
  // job — .open is about what validate() ACCEPTS, not what it strips.
  get open() {
    return create({ ...s, additionalProperties: true }, optional)
  },

  // --- Metadata ---
  title: (t: string) => create({ ...s, title: t }, optional),
  describe: (d: string) => create({ ...s, description: d }, optional),
  default: (v: any) => create({ ...s, default: v }, optional),
  meta: (m: Record<string, any>) => create({ ...m, ...s, ...m }, optional),

  // --- Polymorphic Constraints ---
  min: (v: number) => {
    const key =
      s.type === 'string'
        ? 'minLength'
        : s.type === 'array'
        ? 'minItems'
        : s.type === 'object'
        ? 'minProperties'
        : 'minimum'
    return create({ ...s, [key]: v }, optional)
  },
  max: (v: number) => {
    const key =
      s.type === 'string'
        ? 'maxLength'
        : s.type === 'array'
        ? 'maxItems'
        : s.type === 'object'
        ? 'maxProperties' // enforced in every mode as of v1.9.0 (short-circuits at max+1)
        : 'maximum'
    return create({ ...s, [key]: v }, optional)
  },

  // --- String Specific ---
  pattern: (r: RegExp | string) =>
    create({ ...s, pattern: typeof r === 'string' ? r : r.source }, optional),

  get email() {
    return create({ ...s, format: 'email' }, optional)
  },
  get uuid() {
    return create({ ...s, format: 'uuid' }, optional)
  },
  get ipv4() {
    return create({ ...s, format: 'ipv4' }, optional)
  },
  get url() {
    return create({ ...s, format: 'uri' }, optional)
  },
  get datetime() {
    return create({ ...s, format: 'date-time' }, optional)
  },
  get date() {
    return create({ ...s, format: 'date' }, optional)
  },
  get emoji() {
    return create({ ...s, pattern: `^${RX_EMOJI_ATOM}+$`, format: 'emoji' }, optional)
  },

  // --- Number Specific ---
  get int() {
    return create({ ...s, type: 'integer' }, optional)
  },
  step: (v: number) => create({ ...s, multipleOf: v }, optional),
})

// THE LIE

export type Infer<S> = S extends { _type: infer T } ? T : never

// --- JSON Schema Type Definition ---
export interface JSONSchema {
  type?: string | string[]
  properties?: Record<string, JSONSchema>
  additionalProperties?: boolean | JSONSchema
  items?: JSONSchema
  /** typed for interop but NOT enforced by validate (agentContract refuses it) */
  prefixItems?: JSONSchema[]
  required?: string[]
  enum?: readonly unknown[]
  const?: unknown
  anyOf?: JSONSchema[]
  allOf?: JSONSchema[]
  oneOf?: JSONSchema[]
  not?: JSONSchema
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  minItems?: number
  maxItems?: number
  minProperties?: number
  maxProperties?: number
  title?: string
  description?: string
  default?: unknown
  examples?: unknown[]
  $ref?: string
  $defs?: Record<string, JSONSchema>
  $schema?: string
  /**
   * Computational validation (progressive enhancement). The value is the
   * *source* of a predicate (conceptually: takes the value at this node,
   * returns boolean) — the "computational half" plain JSON Schema can't
   * express (open value grammars, recursive structure). The exact source
   * format is defined by the registered evaluator, pending a specification
   * from the canonical engine (tjs-lang).
   *
   * A naive validator ignores this keyword and checks only the structural part.
   * A predicate-aware one runs it — but only when an evaluator has been
   * registered via {@link setPredicateEvaluator}, so this library stays zero-dep
   * (the predicate engine lives in the consumer, e.g. `tjs-lang`).
   *
   * Predicates run against TYPE-VALID values only and never against
   * `null`/`undefined` (those are settled by `type` first) — encode
   * null-handling in the type, not the predicate.
   */
  $predicate?: string
  /**
   * Values this schema must REFUSE (convention, paired with the standard
   * `examples` keyword): a gate that never says no isn't a gate. Exercised by
   * {@link checkExamples} and by contract harnesses (e.g. tosijs's
   * `exerciseContract`). Like all unknown `$`-prefixed keys, ignored by
   * {@link validate}.
   */
  $counterexamples?: unknown[]
  /**
   * Marks a schema as OBSERVED (derived by {@link inferSchema} from a sample)
   * rather than AUTHORED — so a reader can tell "a sample looked like this"
   * from "someone promised this". A pure annotation: ignored by
   * {@link validate}, allowed through `agentContract`.
   */
  $inferred?: boolean
  // Extension keywords pass through validation untouched — guaranteed for
  // x-* (OpenAPI convention) and unrecognized $-prefixed keys alike
  [key: `x-${string}`]: unknown
  [key: `$${string}`]: unknown
}

/**
 * Evaluates a `$predicate` source against a value. Registered by a consumer that
 * has a predicate engine (e.g. `tjs-lang`'s `createPredicateEvaluator()`), so
 * this library carries no such dependency. Must fail closed (return `false`) on
 * an unverifiable/unsafe source rather than throw.
 */
export type PredicateEvaluator = (source: string, value: unknown) => boolean

let predicateEvaluator: PredicateEvaluator | null = null

/**
 * Register (or clear, with `null`) the evaluator used for the `$predicate`
 * keyword. Until one is set, `$predicate` is ignored and validation is purely
 * structural (progressive enhancement). Returns the previous evaluator.
 */
export function setPredicateEvaluator(
  fn: PredicateEvaluator | null
): PredicateEvaluator | null {
  const prev = predicateEvaluator
  predicateEvaluator = fn
  return prev
}

/** The currently-registered `$predicate` evaluator, if any. */
export function getPredicateEvaluator(): PredicateEvaluator | null {
  return predicateEvaluator
}

// --- Type Helpers for Object Optionality ---
// These are EXPORTED, and must stay exported, even though consumers rarely
// name them by hand. A published library that re-exports a schema
// (`export const S = s.object({...})`) emits a .d.ts referencing the builder's
// return type; if that type is not publicly nameable, declaration emit fails
// with TS4023 and the consumer cannot ship at all. `tsc --noEmit` passes, so
// nothing catches it until someone tries to publish — see issue #11.
export type OptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never
}[keyof T]
export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K
}[keyof T]
export type SmartObject<T> = { [K in OptionalKeys<T>]?: T[K] } & {
  [K in RequiredKeys<T>]: T[K]
} extends infer O
  ? { [K in keyof O]: O[K] }
  : never

export interface Base<T> {
  schema: JSONSchema
  _type: T
  get optional(): Base<T | undefined>
  validate(val: any, opts?: ValidateOptions | ErrorHandler): boolean
  title(t: string): Base<T>
  describe(d: string): Base<T>
  default(v: T): Base<T>
  meta(m: Record<string, any>): Base<T>
}

export interface Str<T = string> extends Base<T> {
  // Metadata Overrides
  title(t: string): Str<T>
  describe(d: string): Str<T>
  default(v: T): Str<T>
  meta(m: Record<string, any>): Str<T>

  // Constraints
  min(len: number): Str<T>
  max(len: number): Str<T>
  pattern(r: RegExp | string): Str<T>
  get email(): Str<T>
  get uuid(): Str<T>
  get ipv4(): Str<T>
  get url(): Str<T>
  get datetime(): Str<T>
  get date(): Str<T>
  get emoji(): Str<T>
}

export interface Num<T = number> extends Base<T> {
  title(t: string): Num<T>
  describe(d: string): Num<T>
  default(v: T): Num<T>
  meta(m: Record<string, any>): Num<T>

  min(val: number): Num<T>
  max(val: number): Num<T>
  step(val: number): Num<T>
  get int(): Num<T>
}

export interface Arr<T> extends Base<T> {
  title(t: string): Arr<T>
  describe(d: string): Arr<T>
  default(v: T): Arr<T>
  meta(m: Record<string, any>): Arr<T>

  min(count: number): Arr<T>
  max(count: number): Arr<T>
}

export interface Obj<T> extends Base<T> {
  title(t: string): Obj<T>
  describe(d: string): Obj<T>
  default(v: T): Obj<T>
  meta(m: Record<string, any>): Obj<T>

  min(count: number): Obj<T>
  max(count: number): Obj<T>
  /** keep the declared fields, admit unknown ones (`additionalProperties: true`) */
  get open(): Obj<T>
}

// PROXY

/**
 * Builder-construction guard (board #1391). The combinators take BUILDERS;
 * handed a plain schema they used to read `.schema` off it and get
 * `undefined` — `s.array({ type: 'string' })` silently built `{ type: 'array' }`
 * with no `items` (accept-all elements), while `s.object` threw a raw internal
 * TypeError. TypeScript's `Base<T>` catches this; JS callers, `as any` and
 * deserialized config do not. Fail loudly, naming the argument.
 */
// Array.isArray throws on a revoked Proxy; construction guards must not leak that
const isArray = (x: any): boolean => {
  try {
    return Array.isArray(x)
  } catch {
    return false
  }
}

const assertBuilder = (x: any, where: string): void => {
  let ok = false
  let got = 'a plain schema'
  try {
    ok = isBuilder(x)
    if (!ok) got = Array.isArray(x) ? 'an array' : typeof x === 'object' && x ? got : String(x)
  } catch {} // a throwing or revoked Proxy still gets the named error below
  if (!ok) throw new TypeError(`${where}: expected a builder like s.string, not ${got}`)
}

const methods = {
  // --- First-Class Formats ---
  get email() {
    return create({ type: 'string', format: 'email' }) as Str
  },
  get uuid() {
    return create({ type: 'string', format: 'uuid' }) as Str
  },
  get ipv4() {
    return create({ type: 'string', format: 'ipv4' }) as Str
  },
  get url() {
    return create({ type: 'string', format: 'uri' }) as Str
  },
  get datetime() {
    return create({ type: 'string', format: 'date-time' }) as Str
  },
  get date() {
    return create({ type: 'string', format: 'date' }) as Str
  },
  get emoji() {
    return create({
      type: 'string',
      pattern: `^${RX_EMOJI_ATOM}+$`,
      format: 'emoji',
    }) as Str
  },
  get null() {
    return create({ type: 'null' }) as Base<null>
  },
  get undefined() {
    return create({ type: 'null', 'x-tjs-undefined': true }) as Base<undefined>
  },
  get any() {
    return create({}) as Base<any>
  },

  pattern: (r: RegExp | string) =>
    create({
      type: 'string',
      pattern: typeof r === 'string' ? r : r.source,
    }) as Str,

  union: <T extends Base<any>[]>(schemas: T) => {
    if (!isArray(schemas)) throw new TypeError('s.union expects an array of builders: s.union([s.string, s.number])')
    schemas.forEach((b, i) => assertBuilder(b, `s.union: schemas[${i}]`))
    return create({ anyOf: schemas.map((s) => s.schema) }) as Base<Infer<T[number]>>
  },

  enum: <T extends string | number>(vals: T[]) =>
    create({ type: typeof vals[0], enum: vals }) as Base<T>,

  const: <T extends string | number | boolean | null>(val: T) =>
    create({ const: val }) as Base<T>,

  array: <T>(items: Base<T>) => {
    assertBuilder(items, 's.array(items)')
    return create({ type: 'array', items: items.schema }) as Arr<T[]>
  },

  // FIX: 'readonly' added to generic constraint to force tuple inference
  tuple: <T extends readonly [Base<any>, ...Base<any>[]]>(items: T) => {
    if (!isArray(items)) throw new TypeError('s.tuple expects an array of builders: s.tuple([s.string, s.number])')
    items.forEach((b, i) => assertBuilder(b, `s.tuple: items[${i}]`))
    return create({
      type: 'array',
      items: items.map((s) => s.schema),
      minItems: items.length,
      maxItems: items.length,
    }) as Base<{ [K in keyof T]: T[K] extends Base<infer U> ? U : never }>
  },

  // FIX: Wrapped return type in SmartObject<>
  object: <P extends Record<string, Base<any>>>(
    props: P,
    options?: { additionalProperties?: boolean }
  ) => {
    const properties: any = {}
    const required: string[] = []
    for (const k in props) {
      assertBuilder(props[k], `s.object: property ${JSON.stringify(k)}`)
      properties[k] = props[k]!.schema
      // Optionality comes from the builder's _optional flag (set by
      // .optional, covers typeless builders like s.any.optional), or a
      // null-including type array for hand-written plain-JSON schemas.
      const p = properties[k]
      if (
        (props[k] as any)._optional !== true &&
        (!Array.isArray(p.type) || !p.type.includes('null'))
      ) {
        required.push(k)
      }
    }
    return create({
      type: 'object',
      properties,
      required,
      // strict by default; { additionalProperties: true } (or `.open`) keeps
      // the named fields AND admits unknown ones — for shapes that belong to
      // a protocol you don't control
      additionalProperties: options?.additionalProperties === true,
    }) as Obj<SmartObject<{ [K in keyof P]: Infer<P[K]> }>>
  },

  record: <T>(value: Base<T>) => {
    if (value == null) {
      throw new Error(
        's.record(valueSchema) requires a value schema — use s.record(s.any) for unconstrained values'
      )
    }
    assertBuilder(value, 's.record(valueSchema)')
    return create({
      type: 'object',
      additionalProperties: value.schema,
    }) as Obj<Record<string, T>>
  },

  /**
   * @deprecated Legacy: samples only the first array element and closes
   * objects (`additionalProperties: false`). Use `inferSchema` (from
   * `tosijs-schema` / `tosijs-schema/infer`), which unifies across every
   * element and leaves objects open.
   */
  infer: (value: any): Base<any> => {
    if (value === null) return create({ type: 'null' }) as Base<null>
    if (value === undefined) return create({ type: 'null', 'x-tjs-undefined': true }) as Base<undefined>
    const t = typeof value
    if (t === 'string') return create({ type: 'string' }) as Str
    if (t === 'number') return create({ type: Number.isInteger(value) ? 'integer' : 'number' }) as Num
    if (t === 'boolean') return create({ type: 'boolean' }) as Base<boolean>
    if (Array.isArray(value)) {
      if (value.length === 0) return create({ type: 'array' }) as Arr<any[]>
      return create({ type: 'array', items: methods.infer(value[0]).schema }) as Arr<any[]>
    }
    if (t === 'object') {
      const properties: Record<string, any> = {}
      const required: string[] = []
      for (const k in value) {
        properties[k] = methods.infer(value[k]).schema
        required.push(k)
      }
      return create({ type: 'object', properties, required, additionalProperties: false }) as Obj<any>
    }
    return create({}) as Base<any>
  },
}

type TinySchema = typeof methods & {
  string: Str
  number: Num
  integer: Num
  boolean: Base<boolean>
  null: Base<null>
  undefined: Base<undefined>
  any: Base<any>
}

export const s = new Proxy(methods, {
  get(target: any, prop: string) {
    if (prop in target) return target[prop]
    if (
      prop === 'string' ||
      prop === 'number' ||
      prop === 'boolean' ||
      prop === 'integer'
    ) {
      const schema = create({ type: prop })
      target[prop] = schema
      return schema
    }
    return undefined
  },
}) as TinySchema

// VALIDATOR

/**
 * Own string keys of a DATA value, including NON-ENUMERABLE ones.
 *
 * `for..in` + `hasOwn` — what every one of these sites used to do — sees only
 * *enumerable* own properties, so a non-enumerable own property was invisible
 * to `additionalProperties: false` (it passed as though absent), invisible to
 * `additionalProperties: <schema>` (never validated against anything), and
 * uncounted by `min/maxProperties`. That is a fail-open: the check returned
 * `true` having not looked. `JSON.parse` never produces such a property, but a
 * live JS object can — and `agentContract` judges live objects
 * (`proposal.proposed`), which is where it mattered.
 *
 * Also FASTER than `for..in` + a `hasOwnProperty` call per key (measured 0.52x
 * to 0.81x across 10/100/1000 keys) — the per-key call dominates. Prototype
 * keys stay excluded, as before.
 */
const ownKeys = (o: any): string[] => Object.getOwnPropertyNames(o)

/**
 * Read a property without letting USER CODE escape as an exception.
 *
 * `validate` is documented in three shipped files as never throwing, and a
 * property read can run an accessor: a throwing getter, or the ES poison-pill
 * `callee` on a plain `arguments` object (an own, NON-enumerable accessor —
 * invisible to `for..in`, so this only became reachable when the sweep started
 * reading own non-enumerable keys). An unreadable property cannot be shown to
 * satisfy its schema, so it fails CLOSED rather than propagating.
 *
 * The sentinel is a module-private symbol, so no data value can forge it.
 */
const UNREADABLE = Symbol('unreadable')
const readProp = (o: any, k: string): any => {
  try {
    return o[k]
  } catch {
    return UNREADABLE
  }
}


/** @internal Sentinel: `unwrap` could not tell what it was handed. Never a schema. */
export const AMBIGUOUS: symbol = Symbol('tosijs-schema.ambiguous')

/** @internal */
export const AMBIGUOUS_MESSAGE =
  'ambiguous: has a `schema` key but is not a builder — pass the schema itself (e.g. envelope.schema)'

/**
 * Resolve what `validate` / `filter` / `M.func` were handed into a schema.
 *
 * Three shapes reach here: a builder, a plain schema, and a non-builder object
 * carrying a `schema` key. The third is genuinely AMBIGUOUS — a wrapper
 * (`{ name, strict, schema }`, the OpenAI `json_schema` envelope) and a plain
 * schema with a stray `schema` key cannot be told apart by inspection. Until
 * 1.12.0 it was unwrapped (`x?.schema ?? x`), so `{ type:'object',
 * required:['a'], schema:true }` validated EVERYTHING; v1.11.0's attempts to
 * discriminate by keyword shape each turned some legitimate wrapper into an
 * accept-all instead. So we stop guessing: builders unwrap, everything else
 * is used as-is, and the ambiguous shape returns an opaque internal sentinel
 * (never a schema), which every caller refuses (fail closed). If you call
 * `unwrap` yourself, guard with `isBuilder` first or pass the schema itself. Never throws — an
 * object whose property access throws is treated as ambiguous.
 *
 * Exported so `validate`, `filter` and `M.func` cannot drift apart.
 */
export const unwrap = (x: any): any => {
  if (x == null || typeof x !== 'object') return x
  try {
    if (isBuilder(x)) return x.schema
    return 'schema' in x ? AMBIGUOUS : x
  } catch {
    return AMBIGUOUS
  }
}

const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k)

// One-time cost nudge for the expensive union (`oneOf` can't short-circuit).
// The message is generic advice, not node-specific, so it fires at most ONCE
// PER PROCESS — repeating it per schema node adds nothing and, crucially, a
// server that JSON.parses a fresh schema object per request would re-warn on
// every request if we keyed the dedup on object identity. Silence entirely
// with setWarnings(false). Never per-value spam.
let warningsEnabled = true
let warnedOneOfCost = false
/** Enable/disable tosijs-schema's runtime cost warnings (default on). Process-global. */
export function setWarnings(on: boolean): void {
  warningsEnabled = on
  // re-arm so a re-enabled process warns again
  if (on) warnedOneOfCost = false
}
const warnExpensive = (): void => {
  if (!warningsEnabled || warnedOneOfCost) return
  warnedOneOfCost = true
  console.warn(
    '[tosijs-schema] `oneOf` is validated by trying every branch (no short-circuit, unlike `anyOf`) — for a discriminated union, `anyOf` is cheaper. Silence with setWarnings(false). This warns once per process.'
  )
}

// does a value match a single JSON Schema type name? (module-level so the
// validator's hot loop doesn't allocate a closure per node)
const matchesType = (v: any, ty: string): boolean =>
  ty === 'integer'
    ? typeof v === 'number' && Number.isInteger(v)
    : ty === 'array'
    ? Array.isArray(v)
    : ty === 'object'
    ? typeof v === 'object' && !Array.isArray(v)
    : ty === 'number'
    ? typeof v === 'number'
    : typeof v === ty

// plain assignment would let a key named '__proto__' REPLACE the target's
// prototype with attacker data — define that one as an own data property
// instead (plain assignment for everything else; defineProperty on every
// key is ~10x slower on the filter copy path)
const setKey = (o: any, k: string, v: any) => {
  if (k === '__proto__') {
    Object.defineProperty(o, k, {
      value: v,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  } else {
    o[k] = v
  }
}

const STRIDE = 97

/**
 * Every keyword `validate`'s walk actually reads. Lives beside the walk so
 * the two cannot drift silently — `agentContract` refuses any schema key
 * outside this set (plus annotations and `x-*`) at construction, which is
 * what keeps typos and unimplemented keywords from shipping as advertised
 * constraints that enforce nothing.
 */
export const ENFORCED_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'additionalProperties',
  '$predicate',
  'x-tjs-undefined',
])

/**
 * @internal The child schema nodes `validate` actually RECURSES into, as
 * [path-segment, node] pairs. Lives beside ENFORCED_KEYWORDS for the same
 * anti-drift reason: contract.ts walks enforced subtrees for the gate's
 * construction refusals, and for whether a `$predicate` can be reached. It
 * used to keep its own copy of this list, which had already drifted from the
 * lint walk. Keep it in step with `walk` below.
 */
export const enforcedSubschemas = (s: any): [string, any][] => {
  const kids: [string, any][] = []
  if (s == null || typeof s !== 'object') return kids
  if (s.properties && typeof s.properties === 'object') {
    for (const k of Object.keys(s.properties)) kids.push([`properties.${k}`, s.properties[k]])
  }
  if (s.items !== undefined) {
    if (Array.isArray(s.items)) s.items.forEach((item: any, i: number) => kids.push([`items.${i}`, item]))
    else kids.push(['items', s.items])
  }
  if (s.additionalProperties !== undefined && typeof s.additionalProperties === 'object') {
    kids.push(['additionalProperties', s.additionalProperties])
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(s[key])) s[key].forEach((sub: any, i: number) => kids.push([`${key}.${i}`, sub]))
  }
  return kids
}

/** object-applicator keywords present — shared by validate's walk and filterData so their applicability can't drift */
const objectKeywordsPresent = (s: any): boolean =>
  s.properties !== undefined ||
  s.required !== undefined ||
  s.additionalProperties !== undefined ||
  s.minProperties !== undefined ||
  s.maxProperties !== undefined

/** array-applicator keywords present — shared by validate's walk and filterData */
const arrayKeywordsPresent = (s: any): boolean =>
  s.items !== undefined || s.minItems !== undefined || s.maxItems !== undefined

export type ErrorHandler = (path: string, msg: string) => void

export interface ValidateOptions {
  onError?: ErrorHandler
  /** Enable strict validation: no stride sampling (full array/dict scan). maxProperties is enforced regardless (v1.9.0). */
  strict?: boolean
  /** @deprecated Use `strict` instead. */
  fullScan?: boolean
}

export function validate(
  val: any,
  builderOrSchema: Base<any> | Record<string, any> | boolean,
  opts?: ValidateOptions | ErrorHandler
): boolean {
  const schema = unwrap(builderOrSchema)
  if (schema === AMBIGUOUS) {
    const onError = typeof opts === 'function' ? opts : opts?.onError
    if (onError) onError('root', AMBIGUOUS_MESSAGE)
    return false
  }
  return validateResolved(val, schema, opts)
}

/**
 * @internal `validate` for an ALREADY-RESOLVED schema: no unwrap, so no
 * ambiguity refusal. The refusal is about what a CALLER handed `validate`;
 * once resolved, every node is a schema, and a `schema` key inside the tree is
 * just an unknown keyword — ignored like any other. Every internal re-entry
 * (union branches, filter's re-validation, a builder's own `.validate`,
 * `agentContract`, `checkExamples`) goes through here, or the root-only
 * refusal would fire at whichever depths happen to re-enter.
 */
export function validateResolved(
  val: any,
  schema: any,
  opts?: ValidateOptions | ErrorHandler
): boolean {
  const onError = typeof opts === 'function' ? opts : opts?.onError
  const fullScan = typeof opts === 'object' ? (opts?.strict ?? opts?.fullScan ?? false) : false

  const path: string[] = []

  const err = (msg: string) => {
    if (onError) onError(path.join('.') || 'root', msg)
    return false
  }

  const walk = (v: any, s: any): boolean => {
    // boolean schemas (standard JSON Schema): true accepts everything,
    // false accepts nothing — `properties: { key: false }` forbids the key
    if (s === true) return true
    if (s === false) return err('Schema forbids value')

    if (Array.isArray(s.anyOf)) {
      let matched = false
      for (const sub of s.anyOf) {
        // branch trials keep strictness but stay silent — only the union as a
        // whole fails, so a passing branch never leaks sibling-branch errors
        if (validateResolved(v, sub, { strict: fullScan })) {
          matched = true
          break
        }
      }
      if (!matched) return err('Union mismatch')
      // anyOf is a constraint, not the whole schema — sibling keywords
      // (const, min/max, properties, $predicate, …) still apply below
    }

    if (Array.isArray(s.oneOf)) {
      // oneOf = EXACTLY one branch matches. Unlike anyOf it cannot
      // short-circuit — every branch must be tried to confirm the count — so
      // it's the expensive union. Warn once (nudge toward anyOf for
      // discriminated unions) unless warnings are silenced.
      warnExpensive()
      let matches = 0
      for (const sub of s.oneOf) {
        if (validateResolved(v, sub, { strict: fullScan })) {
          matches++
          if (matches > 1) break // already too many
        }
      }
      if (matches !== 1) return err(`oneOf: matched ${matches} branches, need exactly 1`)
      // like anyOf, a constraint not the whole schema — siblings still apply
    }

    if (s.const !== undefined) {
      if (v !== s.const) return err('Const mismatch')
      // fall through: const pins the value, siblings still apply
    }

    // enum applies to EVERY instance including null (like const above), so it
    // must run before the null early-out — null passes only if the enum lists
    // it. undefined falls through to the type-based handling below.
    if (Array.isArray(s.enum) && v !== undefined && !s.enum.includes(v)) {
      return err('Enum mismatch')
    }

    // Handle null - check if schema expects null (type: 'null' without x-tjs-undefined)
    if (v === null) {
      const expectsNull = s.type === 'null' && !s['x-tjs-undefined']
      const typeIncludesNull = Array.isArray(s.type) && s.type.includes('null')
      return expectsNull || typeIncludesNull || !s.type || err('Expected value, got null')
    }

    // Handle undefined - check if schema expects undefined (type: 'null' with x-tjs-undefined)
    if (v === undefined) {
      const expectsUndefined = s.type === 'null' && s['x-tjs-undefined']
      const typeIncludesNull = Array.isArray(s.type) && s.type.includes('null')
      return expectsUndefined || typeIncludesNull || !s.type || err('Expected value, got undefined')
    }

    // Resolve the type against JSON Schema UNION semantics: a multi-type
    // array (`['string','number']`) accepts a value matching ANY listed type
    // (null is handled above). `t` becomes whichever listed type the value
    // matches, so the object/array applicators and scalar constraints below
    // apply to the branch that actually matched. Junk / non-string entries
    // are ignored, never misread as "expect null".
    let t: string | undefined
    if (typeof s.type === 'string') {
      // fast path: a single named type (no array allocation)
      if (s.type === 'null') return err('Expected null') // v is non-null here
      if (!matchesType(v, s.type)) return err(`Expected ${s.type}`)
      t = s.type
    } else if (Array.isArray(s.type)) {
      // union: accept a value matching ANY listed non-null type; junk / 'null'
      // entries are skipped (null itself was handled by the early-outs above)
      let hasNonNull = false
      for (const ty of s.type) {
        if (typeof ty !== 'string' || ty === 'null') continue
        hasNonNull = true
        if (matchesType(v, ty)) {
          t = ty
          break
        }
      }
      if (hasNonNull && t === undefined) {
        return err(
          `Expected ${s.type.filter((e: any) => typeof e === 'string' && e !== 'null').join(' | ')}`
        )
      }
      if (!hasNonNull && s.type.includes('null')) return err('Expected null')
    }
    // else: no enforceable type (absent, or all-junk array) → accept

    // $predicate: computational validation on the (type-valid) value. Runs only
    // when an evaluator is registered — a naive validator ignores the keyword
    // and everything above still applies (progressive enhancement).
    if (s.$predicate && predicateEvaluator) {
      if (!predicateEvaluator(s.$predicate, v)) return err('Predicate mismatch')
    }

    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return err('Expected finite number')
      if (s.minimum !== undefined && v < s.minimum) return err('Value < min')
      if (s.maximum !== undefined && v > s.maximum) return err('Value > max')
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum)
        return err('Value <= exclusive min')
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum)
        return err('Value >= exclusive max')
      if (s.multipleOf !== undefined) {
        const remainder = Math.abs(v % s.multipleOf)
        const tolerance = 1e-10
        if (remainder > tolerance && Math.abs(remainder - Math.abs(s.multipleOf)) > tolerance)
          return err('Value not step')
      }
    }
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength)
        return err('Len < min')
      if (s.maxLength !== undefined && v.length > s.maxLength)
        return err('Len > max')
      if (s.pattern) {
        // an invalid regex cannot prove the value valid — fail closed,
        // never throw (agentContract also refuses it at construction)
        try {
          if (!compilePattern(s.pattern, s.format === 'emoji').test(v))
            return err('Pattern mismatch')
        } catch {
          return err('Invalid pattern')
        }
      }
      if (s.format && FMT[s.format] && !FMT[s.format]!(v))
        return err('Format invalid')
    }

    // Per JSON Schema, object/array applicator keywords also apply to a
    // typeless schema when the instance IS an object/array — a gate schema
    // like { properties, required } without `type` must still enforce.
    // All data/schema key membership uses hasOwn: `in` walks the prototype
    // chain, so keys like 'constructor' would bypass every check below.
    if (
      t === 'object' ||
      (!t &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        objectKeywordsPresent(s))
    ) {
      // Property-count constraints, enforced in every mode (v1.9.0) and now
      // counting NON-ENUMERABLE own properties too (v1.11.0 — they used to be
      // invisible, so a hidden key went uncounted). Cost is O(N) in the object's
      // own-key count, and only schemas that DECLARE a count keyword pay it at
      // all. 1.9.0's max+1 short-circuit is gone: it depended on walking keys
      // one at a time, and a correct count has to include the non-enumerable
      // ones, which only a materializing call reports.
      const min = s.minProperties
      const max = s.maxProperties
      if (min !== undefined || max !== undefined) {
        // One native enumeration, then arithmetic. The old code short-circuited
        // at max+1 without materializing, which `getOwnPropertyNames` cannot do
        // — so this is O(N) where it was O(min(N, max+1)). That is a real (and
        // documented) complexity change, accepted because correctness needs the
        // non-enumerable keys and the native call is far cheaper per key than
        // the `for..in` + `hasOwnProperty` loop it replaced.
        const c = ownKeys(v).length
        if (max !== undefined && c > max) return err('Too many props')
        if (min !== undefined && c < min) return err('Too few props')
      }

      if (s.required) {
        for (const k of s.required) if (!hasOwn(v, k)) return err(`Missing ${k}`)
      }

      if (s.additionalProperties === false) {
        for (const k of ownKeys(v)) {
          if (s.properties && hasOwn(s.properties, k)) continue
          return err(`Unexpected ${k}`)
        }
      }

      if (s.properties) {
        for (const k in s.properties) {
          if (hasOwn(v, k)) {
            path.push(k)
            const val = readProp(v, k)
            if (val === UNREADABLE) return err(`Unreadable ${k}`)
            const ok = walk(val, s.properties[k])
            path.pop()
            if (!ok) return false
          }
        }
      }
      if (s.additionalProperties) {
        const keys: string[] = []
        for (const k of ownKeys(v)) {
          if (s.properties && hasOwn(s.properties, k)) continue
          keys.push(k)
        }
        const len = keys.length
        const step = fullScan || len <= STRIDE ? 1 : Math.floor(len / STRIDE)
        for (let i = 0; i < len; i += step) {
          const idx = step > 1 && i > len - 1 - step ? len - 1 : i
          const k = keys[idx]!
          path.push(k)
          const val = readProp(v, k)
          if (val === UNREADABLE) return err(`Unreadable ${k}`)
          const ok = walk(val, s.additionalProperties)
          path.pop()
          if (!ok) return false
          if (idx === len - 1) break
        }
      }
      return true
    }

    if (t === 'array' || (!t && Array.isArray(v) && arrayKeywordsPresent(s))) {
      // min/maxItems are NOT gated behind `items` — a bare
      // { type: 'array', minItems: 1 } must still refuse []
      const len = v.length
      if (s.minItems !== undefined && len < s.minItems)
        return err('Array too short')
      if (s.maxItems !== undefined && len > s.maxItems)
        return err('Array too long')
      if (s.items === undefined) return true

      if (Array.isArray(s.items)) {
        for (let i = 0; i < s.items.length; i++) {
          path.push(String(i))
          if (!walk(v[i], s.items[i])) {
            path.pop()
            return false
          }
          path.pop()
        }
        return true
      }

      const step = fullScan || len <= STRIDE ? 1 : Math.floor(len / STRIDE)
      for (let i = 0; i < len; i += step) {
        const idx = step > 1 && i > len - 1 - step ? len - 1 : i
        path.push(String(idx))
        const ok = walk(v[idx], s.items)
        path.pop()
        if (!ok) return false
        if (idx === len - 1) break
      }
      return true
    }

    return true
  }

  return walk(val, schema)
}


// FILTER

export interface FilterOptions {
  onError?: ErrorHandler
  /** Enable strict validation: no stride sampling (full array/dict scan). maxProperties is enforced regardless (v1.9.0). */
  strict?: boolean
  /** @deprecated Use `strict` instead. */
  fullScan?: boolean
  /**
   * Strip without validating the result. Best-effort: where no union branch
   * fits, that part comes back UNSTRIPPED and nothing says so (without this
   * flag the same case is an Error). Validate the result yourself if it matters.
   */
  skipValidation?: boolean
}

export function filter(
  data: any,
  builderOrSchema: Base<any> | Record<string, any> | boolean,
  opts?: FilterOptions | ErrorHandler
): any {
  const schema = unwrap(builderOrSchema)
  const onError = typeof opts === 'function' ? opts : opts?.onError
  const fullScan = typeof opts === 'object' ? (opts?.strict ?? opts?.fullScan ?? false) : false
  const skipValidation = typeof opts === 'object' ? opts?.skipValidation : false

  if (schema === AMBIGUOUS) {
    if (onError) onError('root', AMBIGUOUS_MESSAGE)
    return new Error(`root: ${AMBIGUOUS_MESSAGE}`)
  }

  // Strip first, then validate the stripped result — filter's job is to
  // remove extras, so they must not trip additionalProperties: false
  const filtered = filterData(data, schema, fullScan)

  if (!skipValidation) {
    let errorPath = ''
    let errorMsg = ''
    const captureError: ErrorHandler = (path, msg) => {
      if (!errorPath) {
        errorPath = path
        errorMsg = msg
      }
      if (onError) onError(path, msg)
    }

    let valid: boolean
    try {
      valid = validateResolved(filtered, schema, { onError: captureError, fullScan })
    } catch (e) {
      // filter's contract is data-or-Error — a malformed schema must not throw
      return new Error(`internal validation error: ${(e as Error).message}`)
    }
    if (!valid) {
      return new Error(`${errorPath}: ${errorMsg}`)
    }
  }

  return filtered
}

function filterData(data: any, schema: any, fullScan = false): any {
  if (data === null || data === undefined) {
    return data
  }
  // boolean schemas strip nothing (validation decides), and a malformed
  // non-object schema (null in a branch list off the wire) must not throw —
  // filter's contract is data-or-Error
  if (schema === null || typeof schema !== 'object') return data

  // Unions. Their SIBLING keywords are AND-ed with them, exactly as validate
  // applies them (properties / additionalProperties beside an anyOf still
  // bind). Returning straight from the union arm ignored the siblings, so
  // filter refused ("Unexpected junk") data whose stripped form validate
  // accepts. Each branch is now stripped against the branch MERGED with its
  // siblings (a key survives if either declares it — recursively, through
  // shared properties and items) and must validate against both.
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const { anyOf, oneOf, ...siblings } = schema
    // fast path: a bare union has no siblings to merge or re-validate, so
    // each branch is used as-is (1.12.0's per-row cost) — `null` means none
    const rest = Object.keys(siblings).length ? siblings : null
    // With both, anyOf is just another SIBLING of oneOf: each oneOf branch's
    // strip schema keeps the anyOf, so filterData recurses into it with the
    // oneOf branch merged in. Running them in sequence let anyOf shed keys
    // only the oneOf branch declares.
    if (Array.isArray(oneOf)) {
      return filterOneOf(data, oneOf, Array.isArray(anyOf) ? { ...siblings, anyOf } : rest, fullScan)
    }
    return filterAnyOf(data, anyOf, rest, fullScan)
  }

  const t = schema.type
  // stripping applies exactly where validation's applicators apply —
  // including typeless schemas — so the two walkers cannot drift
  const asObject =
    (t === 'object' || (!t && objectKeywordsPresent(schema))) &&
    typeof data === 'object' &&
    !Array.isArray(data)
  const asArray =
    (t === 'array' || (!t && arrayKeywordsPresent(schema))) &&
    Array.isArray(data)

  // A propertyless strict object schema means "empty object" — strip to it
  if (asObject && !schema.properties && schema.additionalProperties === false) {
    return {}
  }

  // For objects, only keep properties defined in the schema — plus, when
  // additionalProperties is itself a schema, extras filtered through it
  // (they are legal there; only additionalProperties: false means "strip").
  // The AP branch applies with or without sibling `properties`.
  // additionalProperties: true is spec-equivalent to the empty schema {} —
  // extras are kept (unconstrained), never silently stripped
  const apSchema =
    schema.additionalProperties && typeof schema.additionalProperties === 'object'
      ? schema.additionalProperties
      : schema.additionalProperties === true
        ? {}
        : null
  if (asObject && (schema.properties || apSchema)) {
    const result: Record<string, any> = {}
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (hasOwn(data, key)) {
          setKey(result, key, filterData(data[key], schema.properties[key], fullScan))
        }
      }
    }
    if (apSchema) {
      for (const key of Object.keys(data)) {
        if (schema.properties && hasOwn(schema.properties, key)) continue
        setKey(result, key, filterData(data[key], apSchema, fullScan))
      }
    }
    return result
  }

  // For arrays, filter each item
  if (asArray) {
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        // Tuple: filter each item with corresponding schema
        return data.slice(0, schema.items.length).map((item: any, i: number) =>
          filterData(item, schema.items[i], fullScan)
        )
      } else {
        // Array: filter each item with the same schema
        return data.map((item: any) => filterData(item, schema.items, fullScan))
      }
    }
    return data
  }

  // For primitives, just return the value
  return data
}

// What to KEEP when stripping against `branch` AND its union siblings: a key
// that either one declares and NEITHER forbids (additionalProperties: false
// with the key undeclared). Validation against each separately still decides
// whether the result is acceptable — this only decides what is not shed.
function stripSchema(rest: any, branch: any): any {
  if (rest === true || rest == null || typeof rest !== 'object') return branch
  if (branch === true || branch == null || typeof branch !== 'object') return rest
  // Two unions can't be merged into ONE strip schema (a spread would let one
  // side's anyOf/oneOf silently replace the other's and shed its keys, on
  // VALID data). Strip nothing at this node; validation against each side
  // still decides, so the worst case is a loud Error, never a silent loss.
  const hasUnion = (x: any) => Array.isArray(x.anyOf) || Array.isArray(x.oneOf)
  if (hasUnion(rest) && hasUnion(branch)) return {}
  const out: any = { ...rest, ...branch }
  if (rest.properties || branch.properties) {
    const props: any = { ...rest.properties, ...branch.properties }
    // a key BOTH declare merges recursively — otherwise the branch's node
    // replaces the sibling's wholesale and its nested keys are shed
    if (rest.properties && branch.properties) {
      for (const k of Object.keys(branch.properties)) {
        if (hasOwn(rest.properties, k)) props[k] = stripSchema(rest.properties[k], branch.properties[k])
      }
    }
    for (const side of [rest, branch]) {
      if (side.additionalProperties !== false) continue
      for (const k of Object.keys(props)) if (!side.properties || !hasOwn(side.properties, k)) delete props[k]
    }
    out.properties = props
  }
  if (
    rest.items && branch.items &&
    typeof rest.items === 'object' && typeof branch.items === 'object' &&
    !Array.isArray(rest.items) && !Array.isArray(branch.items)
  ) {
    out.items = stripSchema(rest.items, branch.items)
  }
  out.additionalProperties =
    rest.additionalProperties === false || branch.additionalProperties === false
      ? false
      : (branch.additionalProperties ?? rest.additionalProperties)
  if (out.additionalProperties === undefined) delete out.additionalProperties
  return out
}

const fitsBoth = (v: any, rest: any, branch: any, fullScan: boolean): boolean => {
  try {
    return (
      validateResolved(v, branch, { strict: fullScan }) &&
      (rest === null || validateResolved(v, rest, { strict: fullScan }))
    )
  } catch {
    return false // a malformed branch schema cannot match
  }
}

// anyOf (at-least-one): strip against the first branch whose stripped
// candidate validates — fitting the data to any one branch is correct.
function filterAnyOf(data: any, branches: any[], rest: any, fullScan: boolean): any {
  for (const sub of branches) {
    const candidate = filterData(data, stripSchema(rest, sub), fullScan)
    if (fitsBoth(candidate, rest, sub, fullScan)) return candidate
  }
  return data
}

// oneOf (exactly-one): prefer the branch the ORIGINAL (unstripped) data
// already matches — stripping against it is lossless (a branch the data
// satisfies rejects no field it required). Only when NO branch matches
// as-is (there are genuine extras to shed) do we strip, and then we accept
// the result only if exactly one branch's stripped candidate validates.
// This never silently migrates data onto a different, narrower branch —
// the bug where oneOf:[{a},{a,b}] filtered {a:1,b:2} down to {a:1} by
// stripping b to satisfy branch 1, even though the data matched only
// branch 2. Anything ambiguous (0 or >1 fit) returns unstripped so the
// outer validate surfaces a loud Error rather than a lossy strip.
function filterOneOf(data: any, branches: any[], rest: any, fullScan: boolean): any {
  const origMatches: any[] = []
  for (const sub of branches) {
    if (fitsBoth(data, rest, sub, fullScan)) origMatches.push(sub)
    if (origMatches.length > 1) break // >1 ⇒ not oneOf-valid; result is fixed
  }
  if (origMatches.length === 1) return filterData(data, stripSchema(rest, origMatches[0]), fullScan)
  if (origMatches.length > 1) return data // matches >1 branch: not oneOf-valid
  // no branch matches as-is (genuine extras to shed) → strip against each
  // branch and, among the candidates that validate, keep the one that
  // RETAINS THE MOST data. Never shed a field a valid interpretation keeps
  // (that was the blocker: preferring a narrower branch dropped `b`). A tie
  // at the top is genuinely ambiguous → return unstripped so the outer
  // validate reports a loud Error instead of an arbitrary lossy strip.
  // recursive node count, not just top-level keys — a deeper strip that keeps
  // a nested field must outscore a shallower one, or `filter` over-rejects
  // oneOf inputs whose branches differ only in NESTED structure (two strips
  // tie on top-level size, fall through to the ambiguous-Error arm, and a
  // uniquely-less-lossy result is refused). Genuinely disjoint strips still
  // tie here → Error, so the no-silent-data-loss guarantee is unchanged.
  const size = (x: any): number => {
    if (x === null || typeof x !== 'object') return 0
    let n = 0
    for (const k in x) if (hasOwn(x, k)) n += 1 + size((x as any)[k])
    return n
  }
  let best: any = null
  let bestScore = -1
  let tie = false
  for (const sub of branches) {
    const candidate = filterData(data, stripSchema(rest, sub), fullScan)
    if (!fitsBoth(candidate, rest, sub, fullScan)) continue
    const score = size(candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
      tie = false
    } else if (score === bestScore) {
      tie = true
    }
  }
  return best !== null && !tie ? best : data
}

// DIFF

export function diff(a: any, b: any): any {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a.anyOf || b.anyOf) {
    if (JSON.stringify(a.anyOf) !== JSON.stringify(b.anyOf))
      return { error: 'Union mismatch', from: a.anyOf, to: b.anyOf }
    return null
  }
  if (a.type !== b.type)
    return { error: `Type mismatch: ${a.type} vs ${b.type}` }

  if (a.type === 'object') {
    const d: any = {}
    const keys = new Set([
      ...Object.keys(a.properties || {}),
      ...Object.keys(b.properties || {}),
    ])
    let has = false

    keys.forEach((k) => {
      const pA = a.properties?.[k],
        pB = b.properties?.[k]
      if (!pA) {
        d[k] = { error: 'Added in B' }
        has = true
      } else if (!pB) {
        d[k] = { error: 'Removed in B' }
        has = true
      } else {
        const sub = diff(pA, pB)
        if (sub) {
          d[k] = sub
          has = true
        }
      }
    })
    ;['minProperties', 'maxProperties'].forEach((k) => {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        d[k] = { from: a[k], to: b[k] }
        has = true
      }
    })

    return has ? d : null
  }

  if (a.type === 'array') {
    if (Array.isArray(a.items) && Array.isArray(b.items)) {
      if (a.items.length !== b.items.length)
        return { error: 'Tuple length mismatch' }
      const d: any = {}
      let has = false
      for (let i = 0; i < a.items.length; i++) {
        const sub = diff(a.items[i], b.items[i])
        if (sub) {
          d[i] = sub
          has = true
        }
      }
      return has ? { items: d } : null
    }
    if (!Array.isArray(a.items) && !Array.isArray(b.items)) {
      const d = diff(a.items, b.items)
      return d ? { items: d } : null
    }
    return { error: 'Array type mismatch (Tuple vs List)' }
  }

  const d: any = {}
  let has = false
  ;[
    'minimum',
    'maximum',
    'minLength',
    'pattern',
    'format',
    'enum',
    'const',
    'title',
    'description',
    'default',
  ].forEach((k) => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      d[k] = { from: a[k], to: b[k] }
      has = true
    }
  })
  return has ? d : null
}
