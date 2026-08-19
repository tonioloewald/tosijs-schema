/**
 * Derive a JSON Schema from example data (data → schema, the runtime inverse
 * of `Infer<S>`'s schema → type). Structure only, open by default.
 *
 * Tree-shakeable by design: this module's only runtime import is the tiny
 * shared `./formats` (the format predicates it shares with the validator, so a
 * sniffed format can never reject its own sample). It never imports the
 * builder/validator/contract, so `import { inferSchema } from 'tosijs-schema'`
 * (or the `tosijs-schema/infer` subpath) stays ~1.3kB.
 */
import type { JSONSchema } from './schema'
import { FORMAT_VALIDATORS } from './formats'

export interface InferOptions {
  /**
   * Sniff string `format` (`date-time`, `date`, `email`, `uri`). Off by
   * default. When on, a format is emitted only if EVERY non-null value at
   * that position matches it — never a majority vote (a sample's near-misses
   * are the domain's edge cases).
   */
  formats?: boolean
  /**
   * Propose `enum` for low-cardinality string/number fields. Off by default.
   * `true` uses the defaults below; an object tunes them. A field becomes an
   * enum only if it has ≤ `maxDistinct` distinct values AND those values
   * repeat enough that `coverage` (1 − distinct/samples) ≥ `minCoverage` —
   * otherwise a 3-row fixture turns an id column into an enum of three ids.
   */
  enums?: boolean | { maxDistinct?: number; minCoverage?: number }
  /**
   * Cap how many array elements are unified. Unset = sample everything (the
   * default; the whole point is not to miss a key that's absent from row 0).
   * When set and the input exceeds it, `onTruncate` fires — inference never
   * silently reads "everything" when it didn't.
   */
  sampleSize?: number
  /** Called (once per truncated array) when `sampleSize` drops elements. */
  onTruncate?: (info: { path: string; sampled: number; total: number }) => void
  /**
   * Stamp the root of the result with `$inferred: true`, so a consumer can
   * tell an *observed* schema from an *authored* one — the same `{ type:
   * 'integer' }` means "a sample looked like this" vs "someone promised
   * this", and a reader (agent, form editor, gate) must not mistake one for
   * the other. On by default; set `false` for a clean schema to hand-edit
   * (promoting an inferred schema to a declared one = dropping the marker).
   */
  marker?: boolean
}

const ENUM_DEFAULTS = { maxDistinct: 12, minCoverage: 0.5 }

// The formats worth auto-sniffing, checked with the VALIDATOR's own predicate
// (from ./formats) — never a looser copy. That guarantees a sniffed format is
// a subset of the enforced one, so an inferred schema can't reject its own
// sample, and every emitted format is one agentContract will accept.
// `date` before `date-time` so a date-only string wins the more specific match
const SNIFF_FORMATS = ['date', 'date-time', 'email', 'uri'] as const

const scalarType = (v: unknown): string => {
  if (v === null) return 'null'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v // 'string' | 'boolean'
}

/** stable-sorted unique list — output must be byte-identical for equal input */
const uniqSorted = (xs: string[]): string[] => Array.from(new Set(xs)).sort()

/**
 * Collapse a list of same-position values into one schema, unifying across
 * ALL of them. Recurses through objects (union of keys, presence decides
 * `required`) and arrays (unify all items).
 */
function unify(values: unknown[], opts: InferOptions, path: string): JSONSchema {
  // undefined can't appear in JSON, but in-memory JS data has it — treat it
  // as nullish (a value can be missing here), never as a `type: 'undefined'`
  const nonNull = values.filter((v) => v !== null && v !== undefined)
  const hasNull = nonNull.length < values.length

  if (nonNull.length === 0) {
    // nothing concrete to describe. undefined needs a schema that also
    // accepts undefined ({} — typeless — does); pure null gets `type: null`
    return values.some((v) => v === undefined) || values.length === 0
      ? {}
      : { type: 'null' }
  }

  // partition by KIND — objects, arrays, and scalars are structurally
  // different and can't share one `type` node cleanly
  const objects = nonNull.filter(
    (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
  ) as Record<string, unknown>[]
  const arrays = nonNull.filter(Array.isArray) as unknown[][]
  const scalars = nonNull.filter(
    (v) => typeof v !== 'object' || v === null
  )

  const kinds: JSONSchema[] = []
  if (objects.length) kinds.push(unifyObjects(objects, opts, path))
  if (arrays.length) kinds.push(unifyArrayValues(arrays, opts, path))
  if (scalars.length) kinds.push(scalarSchema(scalars, opts))

  // one kind → that schema (nullable via its own type); more than one →
  // anyOf, so a value of each kind validates against its own branch (this is
  // what keeps the roundtrip guarantee on heterogeneous same-position data)
  if (kinds.length === 1) return withNull(kinds[0]!, hasNull)
  const branches = hasNull ? [...kinds, { type: 'null' } as JSONSchema] : kinds
  return { anyOf: branches }
}

/** a scalar-only union: `type` (single or array) plus opt-in enum/format */
function scalarSchema(scalars: unknown[], opts: InferOptions): JSONSchema {
  const types = uniqSorted(scalars.map(scalarType))
  const schema: JSONSchema = {}
  if (types.length === 1) schema.type = types[0]
  else if (types.length > 1) schema.type = types
  const enumValues = enumFor(scalars, types, opts)
  if (enumValues) schema.enum = enumValues
  else applyFormat(schema, scalars, types, opts) // format only without an enum
  return schema
}

function withNull(schema: JSONSchema, hasNull: boolean): JSONSchema {
  if (!hasNull) return schema
  if (schema.type !== undefined) {
    const arr = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!arr.includes('null')) schema.type = uniqSorted([...arr, 'null'])
  }
  // an enum folds null into itself too, else the null value fails its own enum
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) {
    schema.enum = [...schema.enum, null]
  }
  return schema
}

function unifyObjects(
  objs: Record<string, unknown>[],
  opts: InferOptions,
  path: string
): JSONSchema {
  // union of keys, sorted so output is deterministic regardless of the
  // per-row key order the sample happened to have
  const keys = uniqSorted(objs.flatMap((o) => Object.keys(o)))
  const properties: Record<string, JSONSchema> = {}
  const required: string[] = []
  for (const k of keys) {
    const present = objs.filter((o) =>
      Object.prototype.hasOwnProperty.call(o, k)
    )
    properties[k] = unify(
      present.map((o) => o[k]),
      opts,
      path ? `${path}.${k}` : k
    )
    if (present.length === objs.length) required.push(k) // in every element
  }
  // OPEN by default: an inferred schema describes a sample, not a contract —
  // closing it would make filter() strip fields that happened not to appear
  return { type: 'object', properties, required, additionalProperties: true }
}

function unifyArrayValues(
  arrays: unknown[][],
  opts: InferOptions,
  path: string
): JSONSchema {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  let items: unknown[]
  if (opts.sampleSize !== undefined && total > opts.sampleSize) {
    // bound the copy to sampleSize — don't flatten a huge array just to
    // slice it away (total is counted from lengths, no copy)
    items = []
    for (const a of arrays) {
      for (const el of a) {
        items.push(el)
        if (items.length >= opts.sampleSize) break
      }
      if (items.length >= opts.sampleSize) break
    }
    opts.onTruncate?.({ path: path || '(root)', sampled: items.length, total })
  } else {
    items = arrays.flat()
  }
  if (items.length === 0) return { type: 'array' }
  return { type: 'array', items: unify(items, opts, `${path}[]`) }
}

/** the enum values to emit for a homogeneous string/number field, or null */
function enumFor(
  nonNull: unknown[],
  types: string[],
  opts: InferOptions
): unknown[] | null {
  if (!opts.enums || nonNull.length === 0) return null
  const numeric =
    types.length > 0 && types.every((t) => t === 'integer' || t === 'number')
  const stringy = types.length === 1 && types[0] === 'string'
  if (!numeric && !stringy) return null
  const cfg =
    opts.enums === true ? ENUM_DEFAULTS : { ...ENUM_DEFAULTS, ...opts.enums }
  const distinct = Array.from(new Set(nonNull))
  const coverage = 1 - distinct.length / nonNull.length
  if (distinct.length > cfg.maxDistinct || coverage < cfg.minCoverage) return null
  return numeric
    ? (distinct as number[]).slice().sort((a, b) => a - b)
    : (distinct as string[]).slice().sort()
}

function applyFormat(
  schema: JSONSchema,
  nonNull: unknown[],
  types: string[],
  opts: InferOptions
): void {
  if (!opts.formats || !(types.length === 1 && types[0] === 'string')) return
  const strings = nonNull as string[]
  if (strings.length === 0) return
  // check with the validator's OWN predicate (shared via ./formats), so a
  // sniffed format is always enforceable and never rejects the sample
  for (const fmt of SNIFF_FORMATS) {
    const test = FORMAT_VALIDATORS[fmt]!
    if (strings.every(test)) {
      schema.format = fmt
      return
    }
  }
}

/**
 * Derive a JSON Schema from a sample of data. Structure only — never infers
 * `minimum`/`maxLength`/etc. from observed ranges (a sample's extremes are not
 * the domain's). Objects are OPEN (`additionalProperties: true`): the schema
 * describes a sample, not a contract. Total on empty/degenerate input.
 *
 * The output is plain, editable JSON Schema — the workflow is "infer, then
 * refine". Guarantee: `validate(sample, inferSchema(sample))` is always true.
 *
 * @example
 * inferSchema([{ id: 1, tag: 'a' }, { id: 2 }])
 * // { type: 'array', items: {
 * //     type: 'object',
 * //     properties: { id: { type: 'integer' }, tag: { type: 'string' } },
 * //     required: ['id'],            // tag absent from row 2 → optional
 * //     additionalProperties: true } }
 */
export function inferSchema(
  sample: unknown,
  opts: InferOptions = {}
): JSONSchema {
  const schema = unify([sample], opts, '')
  // stamp the ROOT (not every node — the whole artifact is inferred) so it's
  // never mistaken for an authored contract. `$inferred` is a pure annotation:
  // validate ignores it and agentContract allows it through.
  if (opts.marker !== false) schema.$inferred = true
  return schema
}
