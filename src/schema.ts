export type SchemaDef<T> = {
  schema: any
  _type: T // Phantom type for TS inference
  // Chainable methods
  optional: () => SchemaDef<T | undefined>
  min: (val: number) => SchemaDef<T>
  max: (val: number) => SchemaDef<T>
}

// Utility to extract the TypeScript type from a SchemaDef
export type Infer<S> = S extends SchemaDef<infer T> ? T : never

// Helper to create chainable builders
const create = <T>(schema: any): SchemaDef<T> => ({
  schema,
  _type: null as any,

  optional: () =>
    create<T | undefined>({
      ...schema,
      // JSON Schema usually handles optionality via 'required' arrays in parent,
      // but strict null checks often use type: ["string", "null"]
      type: Array.isArray(schema.type)
        ? [...schema.type, 'null']
        : [schema.type, 'null'],
    }),

  min: (val) => create<T>({ ...schema, minimum: val, minLength: val }),
  max: (val) => create<T>({ ...schema, maximum: val, maxLength: val }),
})

// --- 2. THE LIBRARY OBJECT ---

export const s = {
  // Primitives
  string: () => create<string>({ type: 'string' }),
  number: () => create<number>({ type: 'number' }),
  boolean: () => create<boolean>({ type: 'boolean' }),

  // Complex: Array (Generic)
  array: <T>(items: SchemaDef<T>) =>
    create<T[]>({
      type: 'array',
      items: items.schema,
    }),

  // Complex: Object
  object: <P extends Record<string, SchemaDef<any>>>(props: P) => {
    const schemaProps: Record<string, any> = {}
    const required: string[] = []

    for (const key in props) {
      schemaProps[key] = props[key].schema
      // By default, we assume strictness (all fields required) unless marked optional
      // Note: A robust impl would check if the child schema allows null/undefined
      required.push(key)
    }

    return create<{ [K in keyof P]: Infer<P[K]> }>({
      type: 'object',
      properties: schemaProps,
      required,
      additionalProperties: false, // Strict schema
    })
  },
}

// --- 3. THE VALIDATOR (With Prime Jumping) ---

const ARRAY_THRESHOLD = 100
const PRIME_STRIDE = 37

export function validate(value: any, schema: any): boolean {
  // 1. Basic Type Safety
  const type = schema.type
  if (type === 'string' && typeof value !== 'string') return false
  if (type === 'number' && typeof value !== 'number') return false
  if (type === 'boolean' && typeof value !== 'boolean') return false
  if (type === 'array' && !Array.isArray(value)) return false
  if (
    type === 'object' &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  )
    return false

  // 2. Constraints
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return false
    if (schema.maximum !== undefined && value > schema.maximum) return false
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      return false
  }

  // 3. Recursive Object Check
  if (type === 'object' && schema.properties) {
    // Check Required
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) return false
      }
    }
    // Check Props
    for (const key in schema.properties) {
      if (key in value) {
        if (!validate(value[key], schema.properties[key])) return false
      }
    }
  }

  // 4. Recursive Array Check (Optimization)
  if (type === 'array' && schema.items) {
    const len = value.length

    if (len <= ARRAY_THRESHOLD) {
      // Full scan for small arrays
      for (let i = 0; i < len; i++) {
        if (!validate(value[i], schema.items)) return false
      }
    } else {
      // Sparse scan for large arrays
      const stride = Math.floor(len / PRIME_STRIDE) || 1
      for (let i = 0; i < len; i += stride) {
        if (!validate(value[i], schema.items)) return false
      }
    }
  }

  return true
}

// --- 4. THE DIFF ENGINE ---

export function diff(a: any, b: any): any {
  if (a === b) return null
  if (JSON.stringify(a) === JSON.stringify(b)) return null

  // Type Mismatch is a hard stop
  if (a.type !== b.type) {
    return { error: `Type mismatch: ${a.type} vs ${b.type}` }
  }

  // Object Drill-down
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

  // Array Drill-down
  if (a.type === 'array') {
    const d = diff(a.items, b.items)
    return d ? { items: d } : null
  }

  // Atomic Constraints Check
  const constraints = ['minimum', 'maximum', 'minLength']
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
