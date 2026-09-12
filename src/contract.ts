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
import { compilePattern } from './formats'

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
  /**
   * Every contracted root this write would touch — at it, under it, or ABOVE
   * it (an ancestor write replaces the contracted subtree). Empty means the
   * path touches nothing this gate contracts.
   *
   * Exported because `check()` answers `true` both for "valid write" and for
   * "not my business", so a caller that wants a fail-closed posture over
   * uncontracted paths has to ask this question itself — and the obvious
   * hand-rolled version (`path === root || path.startsWith(root + '.')`) is
   * WRONG: it misses bracket indexing, so `billing_rules[0].resource` reads as
   * uncontracted and skips the gate. That bug is invisible to any test suite
   * written in dotted form. This is the matcher `check()` itself uses, so the
   * two cannot disagree. — asked for in #10
   *
   * **Grammar, stated honestly.** This is a prefix test, not a path parser: a
   * path matches when it EQUALS the root or continues it with `.` or `[`.
   * Consequences, both directions:
   * - every spelling of the SUBTREE under a root matches — `r.x`, `r[0].x`,
   *   `r["x"]`, `r.0.x` all match root `r`, because each keeps the `r.`/`r[`
   *   prefix. Child-segment spelling is not the gap.
   * - the ROOT's own spelling must match literally. A multi-segment root
   *   (`app.billing`) is recognized only when the path spells those segments
   *   the same way, so `app["billing"].rate` reads as UNCONTRACTED. A leading
   *   bracket (`["app"].x`) and a JSON Pointer (`/app/billing/rate`) likewise.
   *
   * So the exposure is: a multi-segment root, plus an applier that accepts a
   * respelling of it. `{ unknownPath: 'refuse' }` closes that regardless of
   * spelling. Making the matcher grammar-complete needs a tokenizer, not more
   * string rewriting — see TODO.md.
   *
   * Throws `TypeError` on a non-string `path`: the never-throw guarantee is
   * `check()`'s (it refuses such a write with an `Error` before reaching here),
   * and answering `[]` — "touches no contracted root" — to a question that
   * cannot be evaluated would fail open in the documented
   * `if (affectedRoots(path).length === 0)` posture.
   */
  affectedRoots(path: string): string[]
}

/** a builder (`s.object(...)`) or a plain JSON Schema object */
export type SchemaLike = JSONSchema | boolean | Base<any> | Record<string, any>

/**
 * Unwrap a builder to its plain schema — but ONLY an actual builder.
 *
 * This used to be `x?.schema ?? x`, a duck-type that ran BEFORE the
 * construction allowlist, so a plain JSON schema carrying a stray `schema` key
 * was silently replaced by that key's value: `{ type:'object',
 * additionalProperties:false, schema:true }` became the boolean schema `true`,
 * i.e. a restrictive-looking declaration constructed an ACCEPT-ALL gate. That
 * is reachable from the marketed path — schemas received over the wire — and
 * `schema` is not a JSON Schema keyword, so nothing else flagged it.
 *
 * A builder always carries a `validate` method (see `create()` in schema.ts);
 * a JSON Schema never does. Requiring it means a stray `schema` key now
 * reaches `unenforced()` and is refused at construction, loudly.
 */
const isBuilder = (x: any): boolean =>
  x != null &&
  typeof x === 'object' &&
  'schema' in x &&
  typeof (x as any).validate === 'function'

const toPlain = (schema: SchemaLike): JSONSchema | boolean =>
  (isBuilder(schema) ? (schema as any).schema : schema) as JSONSchema

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
  '$inferred',
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
  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(s[key])) {
      s[key].forEach((sub: any, i: number) => kids.push([`${key}.${i}`, sub]))
    }
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
  ['oneOf', Array.isArray, 'an array'],
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
      'exclusiveMinimum',
      'exclusiveMaximum',
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
  ['exclusiveMinimum', ['number', 'integer']],
  ['exclusiveMaximum', ['number', 'integer']],
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
  // const/anyOf/oneOf, which constrain before the null early-out).
  if (
    s.type === undefined &&
    s.const === undefined &&
    s.anyOf === undefined &&
    s.oneOf === undefined
  ) {
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
      compilePattern(s.pattern, s.format === 'emoji')
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
  // multi-type arrays (`['string','number']`) are enforced with union
  // semantics since 1.6.0 — a value matching any listed type passes — so
  // they no longer fail open and are legal in a gate schema.
  for (const [segment, kid] of enforcedChildren(s)) {
    found.push(...unenforced(kid, `${at}.${segment}`))
  }
  return found
}

/**
 * List the schema-tree locations where the schema uses something `validate`
 * does **not** enforce — a keyword outside `ENFORCED_KEYWORDS` (`allOf`, `not`,
 * `$ref`, `if`/`then`, `patternProperties`, …), a `format` outside
 * `ENFORCED_FORMATS`, an invalid `pattern`, a non-primitive `const`/`enum`, a
 * multi-type array, and so on — each as a `root.path.keyword` string. Empty
 * means the schema is fully within the enforced subset.
 *
 * This is the honest counterpart to `validate` returning a boolean: `validate`
 * silently ignores what it can't check, so a consumer (a schema-driven form, a
 * VM metering cost) uses this to WARN — "this schema uses `allOf`, which is not
 * validated" — instead of implying a check that didn't happen. It never throws
 * (unlike `agentContract`, which refuses such schemas); it just reports. Same
 * walker the gate uses, so the two never drift.
 */
export function unenforcedKeywords(schema: SchemaLike): string[] {
  const s = toPlain(schema)
  if (s === true || s === false) return []
  return unenforced(s)
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
 * - schemas using keywords `validate` does not enforce (`allOf`, `not`,
 *   `$ref`, `if`/`then`, `patternProperties`, …), formats outside
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
  options?: { strict?: boolean; unknownPath?: 'allow' | 'refuse' }
): AgentContract => {
  // Same guard as `unknownPath` below, for the same reason: `?? true` rescues
  // only nullish, so `{ strict: 0 }`, `{ strict: '' }` or `{ strict: NaN }`
  // build a SAMPLING gate — and `{ strict: process.env.STRICT_GATE }` samples
  // when the variable is unset ('') while going strict for the string 'false'.
  // A permissive posture must be reachable only from an explicitly absent option.
  const rawStrict = options?.strict
  if (rawStrict !== undefined && typeof rawStrict !== 'boolean') {
    throw new Error(
      `agentContract: strict must be a boolean, got ${JSON.stringify(rawStrict)} — ` +
        `a non-boolean would coerce this gate into sampling, which is the fail-open ` +
        `a gate must not have`
    )
  }
  const strict = rawStrict ?? true
  // 'allow' (default, unchanged) — a write touching no contracted root passes,
  // which is right for a surface that deliberately contracts a subset.
  // 'refuse' — such a write is a breach. Opt-in because it is only correct when
  // the gate is meant to cover the WHOLE surface; defaulting to it would break
  // every existing partial-contract consumer. See #10: `check()` returning bare
  // `true` for both "valid" and "uncontracted" makes the natural
  // `if (verdict !== true) refuse()` silently unvalidated over every
  // uncontracted root, so the fail-closed posture has to be expressible.
  // Validated at construction, loudly: this is the one option whose entire
  // purpose is a fail-CLOSED posture, so a typo ('Refuse', or a value arriving
  // from config/over the wire) silently degrading to fail-open would be the
  // exact hole it exists to close. The same module already throws on a schema
  // keyword typo (`minumum`) for this reason — an option typo deserves no less.
  //
  // Check the RAW option before defaulting: `?? 'allow'` collapses `null` into
  // the permissive value, so a parsed-JSON `{"unknownPath": null}` — precisely
  // the config/over-the-wire case this guard names — would sail through while
  // 'Refuse' threw. Only an explicitly absent option may default.
  const rawUnknownPath = options?.unknownPath
  if (
    rawUnknownPath !== undefined &&
    rawUnknownPath !== 'allow' &&
    rawUnknownPath !== 'refuse'
  ) {
    throw new Error(
      `agentContract: unknownPath must be 'allow' or 'refuse', got ` +
        `${JSON.stringify(options?.unknownPath)} — an unrecognized value would ` +
        `fall back to 'allow' and fail open, which is what this option exists to prevent`
    )
  }
  const unknownPath: 'allow' | 'refuse' = rawUnknownPath ?? 'allow'
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
  // NOTE: a PREFIX test over path strings, not a path parser. A path matches
  // when it equals the root or continues it with `.` or `[` — so every spelling
  // of the SUBTREE matches (`r["x"]` and `r.0.x` both keep the `r.`/`r[` prefix
  // and DO match root `r`). The gap is the ROOT's own spelling: multi-segment
  // roots must be spelled identically, so `app["billing"].rate` misses root
  // `app.billing` and, under the default `unknownPath: 'allow'`, is not judged.
  //
  // v1.10.0 attempted to close that by canonicalizing every spelling with a
  // regex, and it was reverted: four review passes found a further bypass each
  // time (quoted, then leading, then unquoted/numeric, then dotted-key and
  // element-scoped), the fold silently merged genuinely different locations
  // (`a["b.c"]` is ONE key, not two levels), and the regex was quadratic on
  // unbalanced brackets — a DoS on the least-trusted input in the system. The
  // real fix is a tokenizer comparing SEGMENT ARRAYS plus a written-down
  // grammar; that is its own change, tracked in TODO.md.
  //
  // Until then the honest posture is: this limitation is pre-existing, it is
  // documented, and `{ unknownPath: 'refuse' }` closes it for a gate that is
  // meant to cover a whole surface.
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
    // A non-string path THROWS here rather than answering `[]`. The never-throw
    // contract belongs to check() (which guards before ever calling this), not
    // to a query helper — and `[]` would be actively dangerous, because the
    // documented posture is `if (affectedRoots(path).length === 0) { …ungated… }`:
    // a JSON-decoded array-of-segments would read as "touches nothing" and be
    // waved through. Answering "no roots" to a question we cannot evaluate is
    // the fail-open this whole release is about.
    if (typeof path !== 'string') {
      throw new TypeError(
        `affectedRoots(path): path must be a string, got ${
          path === null ? 'null' : typeof path
        } — cannot locate a write that has no path`
      )
    }
    const at = roots.find((root) => path === root || extendsPath(path, root))
    return at != null ? [at] : roots.filter((root) => extendsPath(root, path))
  }
  return {
    affectedRoots,
    check(path, _value, proposal) {
      // check()'s contract is `true | Error` and it never throws (documented
      // since 1.5.0) — a non-string path must therefore come back as a refusal,
      // not a raw TypeError from the matcher. Fails CLOSED: an unjudgeable
      // path is a breach regardless of `unknownPath`.
      if (typeof path !== 'string') {
        return new Error(
          `contract breach — path must be a string, got ${
            path === null ? 'null' : typeof path
          }; the gate cannot judge a write it cannot locate`
        )
      }
      const at = path || "''"
      const affected = affectedRoots(path)
      if (affected.length === 0) {
        // touches no contracted root — allowed by default, a breach under
        // { unknownPath: 'refuse' }
        if (unknownPath === 'refuse') {
          return new Error(
            `contract breach at ${at} — path touches no contracted root and ` +
              `the gate is { unknownPath: 'refuse' }; contract this root or ` +
              `route the write around the gate deliberately`
          )
        }
        return true
      }
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
