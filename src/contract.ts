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
  const plain: Record<string, JSONSchema | boolean> = {}
  const predicated: Record<string, boolean> = {}
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
      const ok = validate(proposal.proposed, schema, {
        strict,
        onError: (at, msg) => void reasons.push(`${at}: ${msg}`),
      })
      return ok
        ? true
        : new Error(`contract violation at ${at} — ${reasons.join('; ')}`)
    },
    describe: () => structuredClone(plain),
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
   * `unverifiable` — a counterexample that passes structurally but the node
   * carries a `$predicate` and no evaluator is registered, so the refusal
   * may be computational — register an evaluator to settle it
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
        const ok = validate(example, s, {
          strict: true,
          onError: (p, m) => void reasons.push(`${p}: ${m}`),
        })
        if (!ok) {
          findings.push({
            schemaPath: at,
            kind: 'example',
            index,
            problem: 'rejected',
            reasons,
          })
        }
      })
    }
    if (Array.isArray(s.$counterexamples)) {
      s.$counterexamples.forEach((counter: unknown, index: number) => {
        if (validate(counter, s, { strict: true })) {
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
