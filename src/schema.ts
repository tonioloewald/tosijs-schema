/* -------------------------------------------------------------------------- */
/* 1. THE LIE (Universal Builder & Runtime)                                   */
/* -------------------------------------------------------------------------- */
const RX_EMOJI_ATOM = '\\p{Extended_Pictographic}'

const create = (s: any): any => ({
  schema: s,
  _type: null as any,

  // --- Modifiers ---
  // Kept as function because it technically toggles state, but could be getter too.
  // We'll keep it as function for "action" semantics, or getter for "state".
  // Let's make it a GETTER for maximum clean syntax: s.string.optional
  get optional() {
    return create({
      ...s,
      type: Array.isArray(s.type) ? [...s.type, 'null'] : [s.type, 'null'],
    })
  },

  // --- Polymorphic Constraints (Functions - Require Args) ---
  min: (v: number) => {
    const key =
      s.type === 'string'
        ? 'minLength'
        : s.type === 'array'
        ? 'minItems'
        : 'minimum'
    return create({ ...s, [key]: v })
  },
  max: (v: number) => {
    const key =
      s.type === 'string'
        ? 'maxLength'
        : s.type === 'array'
        ? 'maxItems'
        : 'maximum'
    return create({ ...s, [key]: v })
  },

  // --- String Specific (Functions - Require Args) ---
  pattern: (r: RegExp | string) =>
    create({ ...s, pattern: typeof r === 'string' ? r : r.source }),

  // --- String Specific (Getters - No Args) ---
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
    return create({
      ...s,
      pattern: `^${RX_EMOJI_ATOM}+$`,
      format: 'emoji',
    })
  },

  // --- Number Specific (Getters) ---
  get int() {
    return create({ ...s, type: 'integer' })
  },

  // --- Number Specific (Functions) ---
  step: (v: number) => create({ ...s, multipleOf: v }),
})

/* -------------------------------------------------------------------------- */
/* 2. THE TRUTH (Type Definitions)                                            */
/* -------------------------------------------------------------------------- */

export type Infer<S> = S extends { _type: infer T } ? T : never

interface Base<T> {
  schema: any
  _type: T
  // Optional is now a property too!
  get optional(): Base<T | undefined>
}

interface Str<T = string> extends Base<T> {
  // Functions (Need args)
  min(len: number): Str<T>
  max(len: number): Str<T>
  pattern(r: RegExp | string): Str<T>

  // Properties (No args)
  get email(): Str<T>
  get uuid(): Str<T>
  get ipv4(): Str<T>
  get url(): Str<T>
  get datetime(): Str<T>
  get emoji(): Str<T> // Bonus!
}

interface Num<T = number> extends Base<T> {
  min(val: number): Num<T>
  max(val: number): Num<T>
  step(val: number): Num<T>

  // Properties
  get int(): Num<T>
}

interface Arr<T> extends Base<T> {
  min(count: number): Arr<T>
  max(count: number): Arr<T>
}

/* -------------------------------------------------------------------------- */
/* 3. THE PROXY (Lazy Instantiation)                                          */
/* -------------------------------------------------------------------------- */

const methods = {
  union: <T extends Base<any>[]>(schemas: T) =>
    create({ anyOf: schemas.map((s) => s.schema) }) as Base<Infer<T[number]>>,

  enum: <T extends string | number>(vals: T[]) =>
    create({ type: typeof vals[0], enum: vals }) as Base<T>,

  array: <T>(items: Base<T>) =>
    create({ type: 'array', items: items.schema }) as Arr<T[]>,

  object: <P extends Record<string, Base<any>>>(props: P) => {
    const properties: any = {}
    const required: string[] = []
    for (const k in props) {
      properties[k] = props[k]!.schema
      required.push(k)
    }
    return create({
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    }) as Base<{ [K in keyof P]: Infer<P[K]> }>
  },
}

type TinySchema = typeof methods & {
  string: Str
  number: Num
  boolean: Base<boolean>
}

export const s = new Proxy(methods, {
  get(target: any, prop: string) {
    if (prop in target) return target[prop]

    if (prop === 'string' || prop === 'number' || prop === 'boolean') {
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

const ARR_THR = 100
const PRIME = 37
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
  // Unicode compliant emoji check
  emoji: (v) => new RegExp(RX_EMOJI_ATOM, 'u').test(v),
}

export function validate(val: any, schema: any): boolean {
  if (schema.anyOf) {
    for (const sub of schema.anyOf) if (validate(val, sub)) return true
    return false
  }

  if (val === null || val === undefined) {
    return Array.isArray(schema.type) && schema.type.includes('null')
  }

  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schema.enum && !schema.enum.includes(val)) return false

  if (t === 'integer') {
    if (typeof val !== 'number' || !Number.isInteger(val)) return false
  } else if (t === 'array') {
    if (!Array.isArray(val)) return false
  } else if (t === 'object') {
    if (typeof val !== 'object' || Array.isArray(val)) return false
  } else if (t && typeof val !== t) return false

  if (typeof val === 'number') {
    if (schema.minimum !== undefined && val < schema.minimum) return false
    if (schema.maximum !== undefined && val > schema.maximum) return false
    if (schema.multipleOf !== undefined && val % schema.multipleOf !== 0)
      return false
  }
  if (typeof val === 'string') {
    if (schema.minLength !== undefined && val.length < schema.minLength)
      return false
    if (schema.maxLength !== undefined && val.length > schema.maxLength)
      return false
    if (
      schema.pattern &&
      !new RegExp(schema.pattern, schema.format === 'emoji' ? 'u' : '').test(
        val
      )
    )
      return false
    if (schema.format && FMT[schema.format] && !FMT[schema.format]!(val))
      return false
  }

  if (t === 'object' && schema.properties) {
    if (schema.required)
      for (const k of schema.required) if (!(k in val)) return false
    for (const k in schema.properties) {
      if (k in val && !validate(val[k], schema.properties[k])) return false
    }
  }

  if (t === 'array' && schema.items) {
    const len = val.length
    if (schema.minItems !== undefined && len < schema.minItems) return false
    if (schema.maxItems !== undefined && len > schema.maxItems) return false

    if (len <= ARR_THR) {
      for (let i = 0; i < len; i++)
        if (!validate(val[i], schema.items)) return false
    } else {
      const stride = Math.floor(len / PRIME) || 1
      for (let i = 0; i < len; i += stride)
        if (!validate(val[i], schema.items)) return false
    }
  }

  return true
}

/* -------------------------------------------------------------------------- */
/* 5. THE DIFF ENGINE                                                         */
/* -------------------------------------------------------------------------- */

export function diff(a: any, b: any): any {
  if (JSON.stringify(a) === JSON.stringify(b)) return null

  if (a.anyOf || b.anyOf) {
    if (JSON.stringify(a.anyOf) !== JSON.stringify(b.anyOf)) {
      return { error: 'Union mismatch', from: a.anyOf, to: b.anyOf }
    }
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
    return has ? d : null
  }

  if (a.type === 'array') {
    const d = diff(a.items, b.items)
    return d ? { items: d } : null
  }

  const d: any = {}
  let has = false
  ;['minimum', 'maximum', 'minLength', 'pattern', 'format', 'enum'].forEach(
    (k) => {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        d[k] = { from: a[k], to: b[k] }
        has = true
      }
    }
  )
  return has ? d : null
}
