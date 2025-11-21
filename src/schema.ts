// --- 1. TYPE DEFINITIONS ---

export type SchemaDef<T> = {
  schema: any
  _type: T
  // Chainable methods
  optional: () => SchemaDef<T | undefined>
  // Generic Constraints
  min: (val: number) => SchemaDef<T>
  max: (val: number) => SchemaDef<T>
}

// String specific extensions
export type StringSchema<T> = SchemaDef<T> & {
  pattern: (re: RegExp | string) => StringSchema<T>
  email: () => StringSchema<T>
  uuid: () => StringSchema<T>
  url: () => StringSchema<T>
  ipv4: () => StringSchema<T>
  datetime: () => StringSchema<T>
}

export type Infer<S> = S extends SchemaDef<infer T> ? T : never

const create = <T>(schema: any): SchemaDef<T> => ({
  schema,
  _type: null as any,

  optional: () =>
    create<T | undefined>({
      ...schema,
      type: Array.isArray(schema.type)
        ? [...schema.type, 'null']
        : [schema.type, 'null'],
    }),

  min: (val) => create<T>({ ...schema, minimum: val, minLength: val }),
  max: (val) => create<T>({ ...schema, maximum: val, maxLength: val }),
})

// --- 2. THE BUILDER ---

export const s = {
  // STRING (Expanded)
  string: (): StringSchema<string> => {
    const base = create<string>({ type: 'string' })
    const withFormat = (fmt: string) =>
      create<string>({ ...base.schema, format: fmt })

    // We cast the return type to StringSchema to expose the extra methods
    return {
      ...base,
      pattern: (re: RegExp | string) =>
        create<string>({
          ...base.schema,
          pattern: typeof re === 'string' ? re : re.source,
        }) as StringSchema<string>,

      email: () => withFormat('email') as StringSchema<string>,
      uuid: () => withFormat('uuid') as StringSchema<string>,
      url: () => withFormat('uri') as StringSchema<string>,
      ipv4: () => withFormat('ipv4') as StringSchema<string>,
      datetime: () => withFormat('date-time') as StringSchema<string>,
    } as StringSchema<string>
  },

  number: () => create<number>({ type: 'number' }),
  boolean: () => create<boolean>({ type: 'boolean' }),

  enum: <T extends string | number>(values: T[]) =>
    create<T>({
      // We guess the JSON type based on the first element
      type: typeof values[0],
      enum: values,
    }),

  array: <T>(items: SchemaDef<T>) =>
    create<T[]>({
      type: 'array',
      items: items.schema,
    }),

  object: <P extends Record<string, SchemaDef<any>>>(props: P) => {
    const schemaProps: Record<string, any> = {}
    const required: string[] = []

    for (const key in props) {
      schemaProps[key] = props[key].schema
      required.push(key)
    }

    return create<{ [K in keyof P]: Infer<P[K]> }>({
      type: 'object',
      properties: schemaProps,
      required,
      additionalProperties: false,
    })
  },
}

// --- 3. THE VALIDATOR ---

const ARRAY_THRESHOLD = 100
const PRIME_STRIDE = 37

// Format Logic (Regexes & Helpers)
const FORMATS: Record<string, (v: string) => boolean> = {
  email: (v) => /^\S+@\S+\.\S+$/.test(v), // Simple "good enough" check
  uuid: (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  ipv4: (v) =>
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      v
    ),
  'date-time': (v) => !isNaN(Date.parse(v)),
  uri: (v) => {
    try {
      new URL(v)
      return true
    } catch {
      return false
    }
  },
}

export function validate(value: any, schema: any): boolean {
  const type = schema.type

  // 1. Type Check
  if (type === 'array') {
    if (!Array.isArray(value)) return false
  } else if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false
  } else if (type === 'number' || type === 'string' || type === 'boolean') {
    if (typeof value !== type) return false
  }

  if (schema.enum) {
    if (!schema.enum.includes(value)) return false
  }

  // 2. String Constraints
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      return false
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      return false

    // Regex Pattern
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern)
      if (!regex.test(value)) return false
    }

    // Formats (UUID, Email, etc)
    if (schema.format && FORMATS[schema.format]) {
      if (!FORMATS[schema.format](value)) return false
    }
  }

  // 3. Number Constraints
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return false
    if (schema.maximum !== undefined && value > schema.maximum) return false
  }

  // 4. Object Recursion
  if (type === 'object' && schema.properties) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) return false
      }
    }
    for (const key in schema.properties) {
      if (key in value) {
        if (!validate(value[key], schema.properties[key])) return false
      }
    }
  }

  // 5. Array Recursion (Prime Step)
  if (type === 'array' && schema.items) {
    const len = value.length
    if (len <= ARRAY_THRESHOLD) {
      for (let i = 0; i < len; i++) {
        if (!validate(value[i], schema.items)) return false
      }
    } else {
      const stride = Math.floor(len / PRIME_STRIDE) || 1
      for (let i = 0; i < len; i += stride) {
        if (!validate(value[i], schema.items)) return false
      }
    }
  }

  return true
}

// --- 4. DIFF ENGINE (Unchanged but included for completeness) ---
export function diff(a: any, b: any): any {
  if (a === b || JSON.stringify(a) === JSON.stringify(b)) return null
  if (a.type !== b.type)
    return { error: `Type mismatch: ${a.type} vs ${b.type}` }

  if (a.type === 'object') {
    const delta: any = {}
    const keys = new Set([
      ...Object.keys(a.properties || {}),
      ...Object.keys(b.properties || {}),
    ])
    let hasDiff = false
    keys.forEach((key) => {
      const pA = a.properties?.[key]
      const pB = b.properties?.[key]
      if (!pA) {
        delta[key] = { error: 'Added in B' }
        hasDiff = true
      } else if (!pB) {
        delta[key] = { error: 'Removed in B' }
        hasDiff = true
      } else {
        const d = diff(pA, pB)
        if (d) {
          delta[key] = d
          hasDiff = true
        }
      }
    })
    return hasDiff ? delta : null
  }
  if (a.type === 'array') {
    const d = diff(a.items, b.items)
    return d ? { items: d } : null
  }
  const constraints = ['minimum', 'maximum', 'minLength', 'pattern', 'format'] // Added format/pattern to diff
  const delta: any = {}
  let hasDiff = false
  constraints.forEach((k) => {
    if (a[k] !== b[k]) {
      delta[k] = { from: a[k], to: b[k] }
      hasDiff = true
    }
  })
  return hasDiff ? delta : null
}
