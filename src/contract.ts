/**
 * Agent-surface contracts: the blessed adapter between a capability-gated
 * write path (e.g. tosijs's agent surface) and this package's `validate`,
 * plus a definition-time lint for the examples-as-tests conventions.
 *
 * The seam is structural — this module depends on nothing outside the
 * package, so the core consuming it can stay zero-dependency.
 */
import {
  validate,
  getPredicateEvaluator,
  ENFORCED_FORMATS,
  ENFORCED_KEYWORDS,
  type JSONSchema,
  type Base,
} from './schema'

/**
 * Supplied by the surface when a write lands at or under a contracted root:
 * the root path and the HYPOTHETICAL whole-root value the write would
 * produce. The surface owns path mechanics (clone + apply); the adapter
 * judges only the proposed root value.
 */
export interface ContractProposal {
  root: string
  proposed: any
}

/**
 * The contract seam shape: `check` returns `true` or an `Error` carrying the
 * refusal REASON; `describe` returns the serializable per-root contract
 * (its keys also tell the surface which roots are contracted).
 */
export interface AgentContract {
  check(path: string, value: any, proposal?: ContractProposal): true | Error
  describe(): Record<string, JSONSchema | boolean>
}

/** a builder (`s.object(...)`) or a plain JSON Schema object */
export type SchemaLike = JSONSchema | boolean | Base<any> | Record<string, any>

const toPlain = (schema: SchemaLike): JSONSchema | boolean =>
  ((schema as any)?.schema ?? schema) as JSONSchema

/**
 * Keys that are pure annotations — legal in a gate schema because they
 * advertise no constraint. Everything that is neither here, nor in
 * {@link ENFORCED_KEYWORDS}, nor `x-*` / a recognized `$`-convention is
 * refused at construction: an ALLOWLIST, because a denylist of "known
 * unenforced" keywords cannot catch typos (`minumum`), new spec keywords,
 * or anything else `validate` silently ignores.
 */
const ANNOTATION_KEYWORDS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'default',
  'examples',
  '$counterexamples',
  '$schema',
  '$id',
  '$comment',
  'deprecated',
  'readOnly',
  'writeOnly',
])

/** child nodes validate actually recurses into (unlike checkExamples' broader subschemas walk) */
const enforcedChildren = (s: any): [string, any][] => {
  const kids: [string, any][] = []
  if (s.properties && typeof s.properties === 'object') {
    for (const k of Object.keys(s.properties)) {
      kids.push([`properties.${k}`, s.properties[k]])
    }
  }
  if (s.items !== undefined) {
    if (Array.isArray(s.items)) {
      s.items.forEach((item: any, i: number) => kids.push([`items.${i}`, item]))
    } else {
      kids.push(['items', s.items])
    }
  }
  if (s.additionalProperties !== undefined && typeof s.additionalProperties === 'object') {
    kids.push(['additionalProperties', s.additionalProperties])
  }
  if (Array.isArray(s.anyOf)) {
    s.anyOf.forEach((sub: any, i: number) => kids.push([`anyOf.${i}`, sub]))
  }
  return kids
}

const isNonPrimitive = (x: any) => x !== null && typeof x === 'object'

/** keyword → the value shape validate's walk dereferences without checking (exported for drift tests) */
export const KEYWORD_SHAPES: [string, (v: any) => boolean, string][] = [
  [
    'type',
    (v) =>
      typeof v === 'string' ||
      (Array.isArray(v) && v.every((x) => typeof x === 'string')),
    'a string or array of strings',
  ],
  ['anyOf', Array.isArray, 'an array'],
  [
    'required',
    (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    'an array of strings',
  ],
  ['enum', Array.isArray, 'an array'],
  [
    'properties',
    (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
    'an object',
  ],
  ['items', (v) => v !== null && typeof v === 'object', 'a schema or array'],
  [
    'additionalProperties',
    (v) => typeof v === 'boolean' || (v !== null && typeof v === 'object'),
    'a boolean or schema',
  ],
  ['pattern', (v) => typeof v === 'string', 'a string'],
  ['format', (v) => typeof v === 'string', 'a string'],
  ['$predicate', (v) => typeof v === 'string', 'a string'],
  ...(
    [
      'minimum',
      'maximum',
      'multipleOf',
      'minLength',
      'maxLength',
      'minItems',
      'maxItems',
      'minProperties',
      'maxProperties',
    ] as const
  ).map(
    (key): [string, (v: any) => boolean, string] => [
      key,
      (v) => typeof v === 'number',
      'a number',
    ]
  ),
]

/** constraint keyword → the type(s) it applies to; anywhere else it is dead (exported for drift tests) */
export const CONSTRAINT_DOMAINS: [string, string[]][] = [
  ['minLength', ['string']],
  ['maxLength', ['string']],
  ['pattern', ['string']],
  ['format', ['string']],
  ['minimum', ['number', 'integer']],
  ['maximum', ['number', 'integer']],
  ['multipleOf', ['number', 'integer']],
  ['items', ['array']],
  ['minItems', ['array']],
  ['maxItems', ['array']],
  ['properties', ['object']],
  ['required', ['object']],
  ['additionalProperties', ['object']],
  ['minProperties', ['object']],
  ['maxProperties', ['object']],
]

/** constraint keywords that silently stop applying when `type` is absent (null/mismatched primitives bypass them) */
const TYPE_DEPENDENT_KEYWORDS = [
  ...CONSTRAINT_DOMAINS.map(([key]) => key),
  'enum',
  '$predicate',
]

/** paths of anything in a schema tree a gate could advertise but validate would not enforce */
const unenforced = (s: any, at = 'root'): string[] => {
  // boolean schemas are fully enforced (true accepts all, false refuses all)
  if (s === true || s === false) return []
  if (s == null || typeof s !== 'object' || Array.isArray(s)) {
    return [`${at} (not a schema)`]
  }
  const found: string[] = []
  for (const key of Object.keys(s)) {
    if (
      !ENFORCED_KEYWORDS.has(key) &&
      !ANNOTATION_KEYWORDS.has(key) &&
      !key.startsWith('x-')
    ) {
      found.push(`${at}.${key}`)
    }
  }
  // malformed keyword value shapes make the walk THROW — refuse them here so
  // check() can honor its true|Error contract
  for (const [key, wellFormed, expected] of KEYWORD_SHAPES) {
    if (s[key] !== undefined && !wellFormed(s[key])) {
      found.push(`${at}.${key} (must be ${expected})`)
    }
  }
  // typeless constraints: per JSON Schema, applicators/constraints only apply
  // when the value matches their type — so null/undefined and mismatched
  // primitives BYPASS them entirely. A gate node must pin the type (or be
  // const/anyOf, which constrain before the null early-out).
  if (s.type === undefined && s.const === undefined && s.anyOf === undefined) {
    const dark = TYPE_DEPENDENT_KEYWORDS.filter((key) => s[key] !== undefined)
    if (dark.length > 0) {
      found.push(
        `${at} (constraints without a type — null/undefined and mismatched ` +
          `primitives bypass ${dark.join('/')}; add an explicit type)`
      )
    }
  }
  // cross-type dead constraints: minLength on a number, minimum on a string…
  // advertised in describe() but validate never consults them
  const declaredTypes: string[] | null =
    typeof s.type === 'string'
      ? [s.type]
      : Array.isArray(s.type) && s.type.every((x: any) => typeof x === 'string')
        ? s.type
        : null
  if (declaredTypes) {
    for (const [key, domain] of CONSTRAINT_DOMAINS) {
      if (
        s[key] !== undefined &&
        !declaredTypes.some((entry) => domain.includes(entry))
      ) {
        found.push(
          `${at}.${key} (never applies to type ${JSON.stringify(s.type)})`
        )
      }
    }
  }
  // value-level holes in otherwise-enforced keywords:
  // format is an annotation for values outside ENFORCED_FORMATS
  if (typeof s.format === 'string' && !ENFORCED_FORMATS.has(s.format)) {
    found.push(`${at}.format:'${s.format}'`)
  }
  // an invalid pattern regex cannot enforce anything (validate fails closed
  // on it, which would refuse every string — surface it at construction)
  if (typeof s.pattern === 'string') {
    try {
      new RegExp(s.pattern, s.format === 'emoji' ? 'u' : '')
    } catch {
      found.push(`${at}.pattern (invalid regex)`)
    }
  }
  // tuple-form items: validate walks only the declared positions, so extra
  // trailing items pass unless maxItems caps the tuple exactly
  if (Array.isArray(s.items) && s.maxItems !== s.items.length) {
    found.push(`${at}.items (tuple without maxItems: ${s.items.length})`)
  }
  // const/enum compare with ===/includes — non-primitive members can never
  // match, so the gate would refuse everything
  if (isNonPrimitive(s.const)) {
    found.push(`${at}.const (non-primitive; === comparison never matches)`)
  }
  if (Array.isArray(s.enum) && s.enum.some(isNonPrimitive)) {
    found.push(`${at}.enum (non-primitive member never matches)`)
  }
  // multi-type arrays: only the first non-null entry is enforced
  if (
    Array.isArray(s.type) &&
    s.type.filter((entry: any) => entry !== 'null').length > 1
  ) {
    found.push(`${at}.type (multi-type array; use anyOf)`)
  }
  for (const [segment, kid] of enforcedChildren(s)) {
    found.push(...unenforced(kid, `${at}.${segment}`))
  }
  return found
}

/**
 * Build an {@link AgentContract} over a map of root path → schema (builders
 * or plain JSON Schema). Judges every proposal against the whole-root schema,
 * so `required` on siblings, cross-field constraints, and root-level
 * `$predicate`s all see deep edits; ignores writes outside contracted roots.
 *
 * Fail-closed by construction:
 * - schemas are deep-copied in (and out via `describe()`), so no caller-side
 *   mutation can rewrite the gate after the fact;
 * - schemas using keywords `validate` does not enforce (`allOf`, `oneOf`,
 *   `not`, `$ref`, `exclusiveMinimum`/`Maximum`, …), formats outside
 *   `ENFORCED_FORMATS`, or uncapped tuple `items` are refused with an Error
 *   at construction rather than silently un-enforced; nested contracted
 *   roots are refused too (which root judges a deep write would be ambiguous);
 * - every write that touches a contracted root — at it, under it, or ABOVE
 *   it (an ancestor write replaces the contracted subtree) — must carry a
 *   proposal for that exact root; anything else is a protocol breach. An
 *   ancestor write spanning several contracted roots is refused outright: one
 *   proposal cannot cover them, so the surface must decompose the write;
 * - a contracted schema carrying `$predicate` refuses writes while no
 *   evaluator is registered — skipping the predicate would fail open.
 *
 * Validation is strict by default — a gate that stochastically samples isn't
 * a gate. Pass `{ strict: false }` to accept sampled validation on huge roots.
 */
export const agentContract = (
  schemas: Record<string, SchemaLike>,
  options?: { strict?: boolean }
): AgentContract => {
  const strict = options?.strict ?? true
  // null-prototype maps: a root literally named '__proto__' must land as an
  // own key, not silently become a prototype assignment (dropping the root
  // from the gate entirely)
  const plain: Record<string, JSONSchema | boolean> = Object.create(null)
  const predicated: Record<string, boolean> = Object.create(null)
  for (const [root, schema] of Object.entries(schemas)) {
    const copy = structuredClone(toPlain(schema))
    const dead = unenforced(copy)
    if (dead.length > 0) {
      throw new Error(
        `agentContract('${root}'): schema uses keyword(s) validate does not enforce — ` +
          `${dead.join(', ')} — a gate must not fail open. Remove them, or express ` +
          `the constraint via $predicate.`
      )
    }
    plain[root] = copy
    predicated[root] = hasPredicate(copy)
  }
  const roots = Object.keys(plain)
  const extendsPath = (child: string, parent: string): boolean =>
    child.startsWith(parent + '.') ||
    child.startsWith(parent + '[') ||
    parent === '' // the empty path is an ancestor of every root
  for (const a of roots) {
    for (const b of roots) {
      if (a !== b && extendsPath(a, b)) {
        throw new Error(
          `agentContract: root '${a}' is nested under root '${b}' — which ` +
            `root judges a deep write would be ambiguous; contract the outer root only`
        )
      }
    }
  }
  /** every contracted root this write would touch (at, under, or above) */
  const affectedRoots = (path: string): string[] => {
    const at = roots.find(
      (root) => path === root || extendsPath(path, root)
    )
    return at != null ? [at] : roots.filter((root) => extendsPath(root, path))
  }
  return {
    check(path, _value, proposal) {
      const at = path || "''"
      const affected = affectedRoots(path)
      if (affected.length === 0) return true // touches no contracted root
      if (proposal == null) {
        return new Error(
          `contract breach at ${at} — write affecting contracted root ` +
            `'${affected[0]}' arrived without a proposal`
        )
      }
      // the ONE proposal must cover every affected root — a typo'd or
      // adversarial proposal.root, or an ancestor write spanning several
      // contracted roots, must not disarm the gate
      const uncovered = affected.filter((root) => root !== proposal.root)
      if (uncovered.length > 0) {
        return new Error(
          `contract breach at ${at} — proposal root '${proposal.root}' ` +
            `does not cover contracted root(s) ` +
            uncovered.map((root) => `'${root}'`).join(', ') +
            (affected.length > 1
              ? '; decompose the write below the shared ancestor'
              : '')
        )
      }
      const schema = plain[proposal.root]!
      if (predicated[proposal.root] && getPredicateEvaluator() == null) {
        return new Error(
          `contract breach at ${at} — contracted root '${proposal.root}' carries ` +
            `a $predicate but no evaluator is registered; the gate would fail open`
        )
      }
      const reasons: string[] = []
      let ok: boolean
      try {
        ok = validate(proposal.proposed, schema, {
          strict,
          onError: (errAt, msg) => void reasons.push(`${errAt}: ${msg}`),
        })
      } catch (e) {
        // the seam is true | Error — an internal throw (malformed schema
        // smuggled past construction, a throwing evaluator) fails CLOSED
        return new Error(
          `contract violation at ${at} — internal validation error: ${(e as Error).message}`
        )
      }
      return ok
        ? true
        : new Error(`contract violation at ${at} — ${reasons.join('; ')}`)
    },
    describe: () => {
      // per-root clone into a fresh plain object; a '__proto__' root must
      // survive as an own key of the output too
      const out: Record<string, JSONSchema | boolean> = {}
      for (const root of roots) {
        Object.defineProperty(out, root, {
          value: structuredClone(plain[root]),
          enumerable: true,
          writable: true,
          configurable: true,
        })
      }
      return out
    },
  }
}

export interface ExampleFinding {
  /** where in the schema tree, e.g. `root` or `root.properties.qty` */
  schemaPath: string
  kind: 'example' | 'counterexample'
  /** index within the node's `examples` / `$counterexamples` array */
  index: number
  /**
   * `rejected` — an example its own schema refuses (a lying spec);
   * `accepted` — a counterexample the gate lets through;
   * `unverifiable` — an example or counterexample that passes structurally
   * but the node carries a `$predicate` and no evaluator is registered, so
   * the computational half went unchecked — register an evaluator to settle it
   */
  problem: 'rejected' | 'accepted' | 'unverifiable'
  reasons?: string[]
}

/** child schema nodes as [path-segment, node] pairs */
const subschemas = (s: any): [string, any][] => {
  if (s == null || typeof s !== 'object') return []
  const kids: [string, any][] = []
  if (s.properties) {
    for (const k of Object.keys(s.properties)) {
      kids.push([`properties.${k}`, s.properties[k]])
    }
  }
  if (s.items) {
    if (Array.isArray(s.items)) {
      s.items.forEach((item: any, i: number) => kids.push([`items.${i}`, item]))
    } else {
      kids.push(['items', s.items])
    }
  }
  if (Array.isArray(s.prefixItems)) {
    s.prefixItems.forEach((item: any, i: number) =>
      kids.push([`prefixItems.${i}`, item])
    )
  }
  if (s.additionalProperties && typeof s.additionalProperties === 'object') {
    kids.push(['additionalProperties', s.additionalProperties])
  }
  for (const key of ['anyOf', 'allOf', 'oneOf']) {
    if (Array.isArray(s[key])) {
      s[key].forEach((sub: any, i: number) => kids.push([`${key}.${i}`, sub]))
    }
  }
  if (s.not) kids.push(['not', s.not])
  if (s.$defs) {
    for (const k of Object.keys(s.$defs)) {
      kids.push([`$defs.${k}`, s.$defs[k]])
    }
  }
  return kids
}

const hasPredicate = (s: any): boolean =>
  s != null &&
  typeof s === 'object' &&
  (typeof s.$predicate === 'string' ||
    subschemas(s).some(([, kid]) => hasPredicate(kid)))

/**
 * Lint a schema's own example data, recursively: every `examples` entry must
 * be accepted by the node that carries it, every `$counterexamples` entry
 * must be refused. Returns findings (empty = the spec doesn't lie). Runs
 * strict — an example a full scan would refuse is a lie even if sampling
 * might miss it.
 */
export function checkExamples(schemaOrBuilder: SchemaLike): ExampleFinding[] {
  const findings: ExampleFinding[] = []
  const visit = (s: any, at: string) => {
    if (s == null || typeof s !== 'object') return
    if (Array.isArray(s.examples)) {
      s.examples.forEach((example: unknown, index: number) => {
        const reasons: string[] = []
        let ok: boolean
        try {
          ok = validate(example, s, {
            strict: true,
            onError: (p, m) => void reasons.push(`${p}: ${m}`),
          })
        } catch (e) {
          ok = false
          reasons.push(`internal validation error: ${(e as Error).message}`)
        }
        if (!ok) {
          findings.push({
            schemaPath: at,
            kind: 'example',
            index,
            problem: 'rejected',
            reasons,
          })
        } else if (getPredicateEvaluator() == null && hasPredicate(s)) {
          // structurally fine, but the predicate half went unchecked — the
          // example is not yet PROVEN accepted
          findings.push({
            schemaPath: at,
            kind: 'example',
            index,
            problem: 'unverifiable',
          })
        }
      })
    }
    if (Array.isArray(s.$counterexamples)) {
      s.$counterexamples.forEach((counter: unknown, index: number) => {
        let passes: boolean
        try {
          passes = validate(counter, s, { strict: true })
        } catch {
          passes = false // a throw is a refusal — the counterexample held
        }
        if (passes) {
          const unverifiable =
            getPredicateEvaluator() == null && hasPredicate(s)
          findings.push({
            schemaPath: at,
            kind: 'counterexample',
            index,
            problem: unverifiable ? 'unverifiable' : 'accepted',
          })
        }
      })
    }
    for (const [segment, kid] of subschemas(s)) {
      visit(kid, `${at}.${segment}`)
    }
  }
  visit(toPlain(schemaOrBuilder), 'root')
  return findings
}
