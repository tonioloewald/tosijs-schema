/* -------------------------------------------------------------------------- */
/* 1. THE TRUTH (Universal Builder & Runtime Implementation)                  */
/* -------------------------------------------------------------------------- */
const RX_EMOJI_ATOM = '\\p{Extended_Pictographic}'

const create = (s: any): any => ({
  schema: s,
  _type: null as any,

  // --- Modifiers ---
  get optional() {
    return create({
      ...s,
      type: Array.isArray(s.type) ? [...s.type, 'null'] : [s.type, 'null'],
    })
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

/* -------------------------------------------------------------------------- */
/* 2. THE LIE (Type Definitions / Declarations)                               */
/* -------------------------------------------------------------------------- */

export type Infer<S> = S extends { _type: infer T } ? T : never

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

interface Base<T> {
  schema: any
  _type: T
  get optional(): Base<T | undefined>

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

/* -------------------------------------------------------------------------- */
/* 3. THE PROXY (Lazy Instantiation)                                          */
/* -------------------------------------------------------------------------- */

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

  pattern: (r: RegExp | string) =>
    create({
      type: 'string',
      pattern: typeof r === 'string' ? r : r.source,
    }) as Str,

  union: <T extends Base<any>[]>(schemas: T) =>
    create({ anyOf: schemas.map((s) => s.schema) }) as Base<Infer<T[number]>>,

  enum: <T extends string | number>(vals: T[]) =>
    create({ type: typeof vals[0], enum: vals }) as Base<T>,

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
      // Heuristic: If the schema type includes 'null', it's optional.
      // This allows .optional() to result in a non-required field.
      if (
        !Array.isArray(properties[k].type) ||
        !properties[k].type.includes('null')
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

  record: <T>(value: Base<T>) =>
    create({
      type: 'object',
      additionalProperties: value.schema,
    }) as Obj<Record<string, T>>,
}

type TinySchema = typeof methods & {
  string: Str
  number: Num
  integer: Num
  boolean: Base<boolean>
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

/* -------------------------------------------------------------------------- */
/* 4. THE VALIDATOR                                                           */
/* -------------------------------------------------------------------------- */

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

export type ErrorHandler = (path: string, msg: string) => void

export interface ValidateOptions {
  onError?: ErrorHandler
  fullScan?: boolean
}

export function validate(
  val: any,
  schema: any,
  opts?: ValidateOptions | ErrorHandler
): boolean {
  const onError = typeof opts === 'function' ? opts : opts?.onError
  const fullScan = typeof opts === 'object' ? opts?.fullScan : false

  const path: string[] = []

  const err = (msg: string) => {
    if (onError) onError(path.join('.') || 'root', msg)
    return false
  }

  const walk = (v: any, s: any): boolean => {
    if (s.anyOf) {
      for (const sub of s.anyOf) {
        if (validate(v, sub)) return true
      }
      return err('Union mismatch')
    }

    if (v === null || v === undefined) {
      return (
        (Array.isArray(s.type) && s.type.includes('null')) ||
        err('Expected value')
      )
    }

    const t = Array.isArray(s.type) ? s.type[0] : s.type
    if (s.enum && !s.enum.includes(v)) return err('Enum mismatch')

    if (t === 'integer') {
      if (typeof v !== 'number' || !Number.isInteger(v))
        return err('Expected integer')
    } else if (t === 'array') {
      if (!Array.isArray(v)) return err('Expected array')
    } else if (t === 'object') {
      if (typeof v !== 'object' || Array.isArray(v))
        return err('Expected object')
    } else if (t && typeof v !== t) return err(`Expected ${t}`)

    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) return err('Value < min')
      if (s.maximum !== undefined && v > s.maximum) return err('Value > max')
      if (s.multipleOf !== undefined && v % s.multipleOf !== 0)
        return err('Value not step')
    }
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength)
        return err('Len < min')
      if (s.maxLength !== undefined && v.length > s.maxLength)
        return err('Len > max')
      if (
        s.pattern &&
        !new RegExp(s.pattern, s.format === 'emoji' ? 'u' : '').test(v)
      )
        return err('Pattern mismatch')
      if (s.format && FMT[s.format] && !FMT[s.format]!(v))
        return err('Format invalid')
    }

    if (t === 'object') {
      if (s.minProperties !== undefined) {
        let c = 0
        for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) c++
        if (c < s.minProperties) return err('Too few props')
      }

      if (s.required) {
        for (const k of s.required) if (!(k in v)) return err(`Missing ${k}`)
      }

      if (s.properties) {
        for (const k in s.properties) {
          if (k in v) {
            path.push(k)
            const ok = walk(v[k], s.properties[k])
            path.pop()
            if (!ok) return false
          }
        }
      }
      if (s.additionalProperties) {
        let i = 0
        for (const k in v) {
          if (s.properties && k in s.properties) continue

          if (!fullScan) {
            i++
            if (i % STRIDE !== 0) continue
          }

          path.push(k)
          const ok = walk(v[k], s.additionalProperties)
          path.pop()
          if (!ok) return false
        }
      }
      return true
    }

    if (t === 'array' && s.items) {
      const len = v.length
      if (s.minItems !== undefined && len < s.minItems)
        return err('Array too short')
      if (s.maxItems !== undefined && len > s.maxItems)
        return err('Array too long')

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

/* -------------------------------------------------------------------------- */
/* 5. THE DIFF ENGINE                                                         */
/* -------------------------------------------------------------------------- */

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
