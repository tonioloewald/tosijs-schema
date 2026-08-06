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
  describe(): Record<string, JSONSchema>
}

/** a builder (`s.object(...)`) or a plain JSON Schema object */
export type SchemaLike = JSONSchema | Base<any> | Record<string, any>

const toPlain = (schema: SchemaLike): JSONSchema =>
  ((schema as any)?.schema ?? schema) as JSONSchema

/**
 * Build an {@link AgentContract} over a map of root path → schema (builders
 * or plain JSON Schema). Judges every proposal against the whole-root schema,
 * so `required` on siblings, cross-field constraints, and root-level
 * `$predicate`s all see deep edits; ignores writes outside contracted roots.
 *
 * Validation is strict by default — a gate that stochastically samples isn't
 * a gate. Pass `{ strict: false }` to accept sampled validation on huge roots.
 */
export const agentContract = (
  schemas: Record<string, SchemaLike>,
  options?: { strict?: boolean }
): AgentContract => {
  const strict = options?.strict ?? true
  const plain: Record<string, JSONSchema> = {}
  for (const [root, schema] of Object.entries(schemas)) {
    plain[root] = toPlain(schema)
  }
  return {
    check(path, _value, proposal) {
      if (proposal == null) return true // outside any contracted root
      const schema = plain[proposal.root]
      if (schema == null) return true
      const reasons: string[] = []
      const ok = validate(proposal.proposed, schema, {
        strict,
        onError: (at, msg) => void reasons.push(`${at}: ${msg}`),
      })
      return ok
        ? true
        : new Error(`contract violation at ${path} — ${reasons.join('; ')}`)
    },
    describe: () => plain,
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
