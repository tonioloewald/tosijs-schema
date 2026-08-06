// THE TRUTH
const RX_EMOJI_ATOM = '\\p{Extended_Pictographic}'

const create = (s: any): any => ({
  schema: s,
  _type: null as any,
  validate: (data: any, opts?: any) => validate(data, s, opts),

  // --- Modifiers ---
  get optional() {
    // null-allowance must live in whatever constraint the schema actually
    // uses: type gains 'null', const becomes a typed enum listing null,
    // anyOf gains a null branch, enum lists null. The x-tjs-optional marker
    // lets s.object() treat typeless optionals (e.g. s.any.optional) as
    // non-required — never place undefined in a type array.
    const out: any = { ...s, 'x-tjs-optional': true }
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
    return create(out)
  },

  // --- Metadata ---
  title: (t: string) => create({ ...s, title: t }),
  describe: (d: string) => create({ ...s, description: d }),
  default: (v: any) => create({ ...s, default: v }),
  meta: (m: Record<string, any>) => create({ ...m, ...s, ...m }),

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
    return create({ ...s, [key]: v })
  },
  max: (v: number) => {
    const key =
      s.type === 'string'
        ? 'maxLength'
        : s.type === 'array'
        ? 'maxItems'
        : s.type === 'object'
        ? 'maxProperties' // Generated for docs, ignored by validator (Ghost)
        : 'maximum'
    return create({ ...s, [key]: v })
  },

  // --- String Specific ---
  pattern: (r: RegExp | string) =>
    create({ ...s, pattern: typeof r === 'string' ? r : r.source }),

  get email() {
    return create({ ...s, format: 'email' })
  },
  get uuid() {
    return create({ ...s, format: 'uuid' })
  },
  get ipv4() {
    return create({ ...s, format: 'ipv4' })
  },
  get url() {
    return create({ ...s, format: 'uri' })
  },
  get datetime() {
    return create({ ...s, format: 'date-time' })
  },
  get emoji() {
    return create({ ...s, pattern: `^${RX_EMOJI_ATOM}+$`, format: 'emoji' })
  },

  // --- Number Specific ---
  get int() {
    return create({ ...s, type: 'integer' })
  },
  step: (v: number) => create({ ...s, multipleOf: v }),
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
type OptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never
}[keyof T]
type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K
}[keyof T]
type SmartObject<T> = { [K in OptionalKeys<T>]?: T[K] } & {
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

interface Str<T = string> extends Base<T> {
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
  get emoji(): Str<T>
}

interface Num<T = number> extends Base<T> {
  title(t: string): Num<T>
  describe(d: string): Num<T>
  default(v: T): Num<T>
  meta(m: Record<string, any>): Num<T>

  min(val: number): Num<T>
  max(val: number): Num<T>
  step(val: number): Num<T>
  get int(): Num<T>
}

interface Arr<T> extends Base<T> {
  title(t: string): Arr<T>
  describe(d: string): Arr<T>
  default(v: T): Arr<T>
  meta(m: Record<string, any>): Arr<T>

  min(count: number): Arr<T>
  max(count: number): Arr<T>
}

interface Obj<T> extends Base<T> {
  title(t: string): Obj<T>
  describe(d: string): Obj<T>
  default(v: T): Obj<T>
  meta(m: Record<string, any>): Obj<T>

  min(count: number): Obj<T>
  max(count: number): Obj<T>
}

// PROXY

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

  union: <T extends Base<any>[]>(schemas: T) =>
    create({ anyOf: schemas.map((s) => s.schema) }) as Base<Infer<T[number]>>,

  enum: <T extends string | number>(vals: T[]) =>
    create({ type: typeof vals[0], enum: vals }) as Base<T>,

  const: <T extends string | number | boolean | null>(val: T) =>
    create({ const: val }) as Base<T>,

  array: <T>(items: Base<T>) =>
    create({ type: 'array', items: items.schema }) as Arr<T[]>,

  // FIX: 'readonly' added to generic constraint to force tuple inference
  tuple: <T extends readonly [Base<any>, ...Base<any>[]]>(items: T) =>
    create({
      type: 'array',
      items: items.map((s) => s.schema),
      minItems: items.length,
      maxItems: items.length,
    }) as Base<{ [K in keyof T]: T[K] extends Base<infer U> ? U : never }>,

  // FIX: Wrapped return type in SmartObject<>
  object: <P extends Record<string, Base<any>>>(props: P) => {
    const properties: any = {}
    const required: string[] = []
    for (const k in props) {
      properties[k] = props[k]!.schema
      // Optionality: the x-tjs-optional marker (set by .optional, covers
      // typeless builders like s.any.optional), or a null-including type
      // array for hand-written schemas.
      const p = properties[k]
      if (
        p['x-tjs-optional'] !== true &&
        (!Array.isArray(p.type) || !p.type.includes('null'))
      ) {
        required.push(k)
      }
    }
    return create({
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    }) as Obj<SmartObject<{ [K in keyof P]: Infer<P[K]> }>>
  },

  record: <T>(value: Base<T>) => {
    if (value == null) {
      throw new Error(
        's.record(valueSchema) requires a value schema — use s.record(s.any) for unconstrained values'
      )
    }
    return create({
      type: 'object',
      additionalProperties: value.schema,
    }) as Obj<Record<string, T>>
  },

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

const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k)

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
const FMT: Record<string, (v: string) => boolean> = {
  email: (v) => /^\S+@\S+\.\S+$/.test(v),
  uuid: (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  uri: (v) => {
    try {
      new URL(v)
      return true
    } catch {
      return false
    }
  },
  ipv4: (v) =>
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      v
    ),
  'date-time': (v) => !isNaN(Date.parse(v)),
  emoji: (v) => new RegExp(RX_EMOJI_ATOM, 'u').test(v),
}

/**
 * The `format` values `validate` actually enforces. Any other format string
 * passes through unchecked (per JSON Schema, `format` is an annotation by
 * default) — `agentContract` refuses out-of-set formats at construction so a
 * gate can't advertise a constraint it doesn't enforce.
 */
export const ENFORCED_FORMATS: ReadonlySet<string> = new Set(Object.keys(FMT))

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
  'minimum',
  'maximum',
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
  /** Enable strict validation: no stride sampling, enforces maxProperties. */
  strict?: boolean
  /** @deprecated Use `strict` instead. */
  fullScan?: boolean
}

export function validate(
  val: any,
  builderOrSchema: Base<any> | Record<string, any> | boolean,
  opts?: ValidateOptions | ErrorHandler
): boolean {
  const schema = (builderOrSchema as any)?.schema || builderOrSchema
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
        if (validate(v, sub, { strict: fullScan })) {
          matched = true
          break
        }
      }
      if (!matched) return err('Union mismatch')
      // anyOf is a constraint, not the whole schema — sibling keywords
      // (const, min/max, properties, $predicate, …) still apply below
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

    // multi-type arrays: enforce the first NON-null STRING entry (null itself
    // is handled above), so ['null','string'] and ['string','null'] agree.
    // Junk entries are ignored rather than misread as "expect null".
    const t = Array.isArray(s.type)
      ? s.type.find(
          (entry: any) => typeof entry === 'string' && entry !== 'null'
        ) ?? (s.type.includes('null') ? 'null' : undefined)
      : s.type
    if (t === 'integer') {
      if (typeof v !== 'number' || !Number.isInteger(v))
        return err('Expected integer')
    } else if (t === 'array') {
      if (!Array.isArray(v)) return err('Expected array')
    } else if (t === 'object') {
      if (typeof v !== 'object' || Array.isArray(v))
        return err('Expected object')
    } else if (t && typeof v !== t) return err(`Expected ${t}`)

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
          if (!new RegExp(s.pattern, s.format === 'emoji' ? 'u' : '').test(v))
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
      // Check property count constraints
      // minProperties: always checked (required for empty object rejection)
      // maxProperties: only checked in fullScan mode (counting is O(n))
      const checkMin = s.minProperties !== undefined
      const checkMax = fullScan && s.maxProperties !== undefined
      if (checkMin || checkMax) {
        let c = 0
        for (const k in v) if (hasOwn(v, k)) c++
        if (checkMin && c < s.minProperties) return err('Too few props')
        if (checkMax && c > s.maxProperties) return err('Too many props')
      }

      if (s.required) {
        for (const k of s.required) if (!hasOwn(v, k)) return err(`Missing ${k}`)
      }

      if (s.additionalProperties === false) {
        for (const k in v) {
          if (!hasOwn(v, k)) continue
          if (s.properties && hasOwn(s.properties, k)) continue
          return err(`Unexpected ${k}`)
        }
      }

      if (s.properties) {
        for (const k in s.properties) {
          if (hasOwn(v, k)) {
            path.push(k)
            const ok = walk(v[k], s.properties[k])
            path.pop()
            if (!ok) return false
          }
        }
      }
      if (s.additionalProperties) {
        const keys: string[] = []
        for (const k in v) {
          if (!hasOwn(v, k)) continue
          if (s.properties && hasOwn(s.properties, k)) continue
          keys.push(k)
        }
        const len = keys.length
        const step = fullScan || len <= STRIDE ? 1 : Math.floor(len / STRIDE)
        for (let i = 0; i < len; i += step) {
          const idx = step > 1 && i > len - 1 - step ? len - 1 : i
          const k = keys[idx]!
          path.push(k)
          const ok = walk(v[k], s.additionalProperties)
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
  /** Enable strict validation: no stride sampling, enforces maxProperties. */
  strict?: boolean
  /** @deprecated Use `strict` instead. */
  fullScan?: boolean
  skipValidation?: boolean
}

export function filter(
  data: any,
  builderOrSchema: Base<any> | Record<string, any> | boolean,
  opts?: FilterOptions | ErrorHandler
): any {
  const schema = (builderOrSchema as any)?.schema || builderOrSchema
  const onError = typeof opts === 'function' ? opts : opts?.onError
  const fullScan = typeof opts === 'object' ? (opts?.strict ?? opts?.fullScan ?? false) : false
  const skipValidation = typeof opts === 'object' ? opts?.skipValidation : false

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
      valid = validate(filtered, schema, { onError: captureError, fullScan })
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

  // Unions: strip against the first branch the stripped data satisfies
  if (Array.isArray(schema.anyOf)) {
    for (const sub of schema.anyOf) {
      const candidate = filterData(data, sub, fullScan)
      try {
        if (validate(candidate, sub, { strict: fullScan })) return candidate
      } catch {
        // a malformed branch schema cannot match — try the next branch
      }
    }
    return data
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
