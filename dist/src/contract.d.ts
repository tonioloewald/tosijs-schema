/**
 * Agent-surface contracts: the blessed adapter between a capability-gated
 * write path (e.g. tosijs's agent surface) and this package's `validate`,
 * plus a definition-time lint for the examples-as-tests conventions.
 *
 * The seam is structural — this module depends on nothing outside the
 * package, so the core consuming it can stay zero-dependency.
 */
import { type JSONSchema, type Base } from './schema';
/**
 * Supplied by the surface when a write lands at or under a contracted root:
 * the root path and the HYPOTHETICAL whole-root value the write would
 * produce. The surface owns path mechanics (clone + apply); the adapter
 * judges only the proposed root value.
 */
export interface ContractProposal {
    root: string;
    proposed: any;
}
/**
 * The contract seam shape: `check` returns `true` or an `Error` carrying the
 * refusal REASON; `describe` returns the serializable per-root contract
 * (its keys also tell the surface which roots are contracted).
 */
export interface AgentContract {
    check(path: string, value: any, proposal?: ContractProposal): true | Error;
    /**
     * The serializable per-root contract. Its keys are exactly the contracted
     * roots, which is what tells a surface (or a remote peer) what is gated.
     *
     * It deliberately does NOT carry the gate's `unknownPath` posture, so two
     * gates built `'allow'` and `'refuse'` serialize identically — a known gap: a
     * remote reader cannot tell which kind of `true` an uncontracted path will
     * get. Folding it in here was considered and rejected, because this map is
     * keyed by caller-supplied root names and any posture key could COLLIDE with
     * a real root (a root literally named `unknownPath` is legal). Exposing it as
     * a sibling member is the right shape, but adding a required member to this
     * interface breaks anyone who implements or wraps it (see #10's note), so it
     * waits for a minor rather than riding a patch. Until then a surface that
     * needs to advertise its posture knows it — it constructed the gate.
     */
    describe(): Record<string, JSONSchema | boolean>;
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
     * Returns a FRESH array each call, safe for the caller to mutate or sort —
     * it is a copy of internal root names, never the gate's own state, so nothing
     * a caller does to it can affect what `check()` enforces. (Decided rather
     * than left implicit: the rest of this module deep-copies obsessively, so the
     * one place handing out an array needed an explicit answer.)
     *
     * Throws `TypeError` on a non-string `path`: the never-throw guarantee is
     * `check()`'s (it refuses such a write with an `Error` before reaching here),
     * and answering `[]` — "touches no contracted root" — to a question that
     * cannot be evaluated would fail open in the documented
     * `if (affectedRoots(path).length === 0)` posture.
     */
    affectedRoots(path: string): string[];
}
/** a builder (`s.object(...)`) or a plain JSON Schema object */
export type SchemaLike = JSONSchema | boolean | Base<any> | Record<string, any>;
/** keyword → the value shape validate's walk dereferences without checking (exported for drift tests) */
export declare const KEYWORD_SHAPES: [string, (v: any) => boolean, string][];
/** constraint keyword → the type(s) it applies to; anywhere else it is dead (exported for drift tests) */
export declare const CONSTRAINT_DOMAINS: [string, string[]][];
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
export declare function unenforcedKeywords(schema: SchemaLike): string[];
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
export declare const agentContract: (schemas: Record<string, SchemaLike>, options?: {
    strict?: boolean;
    unknownPath?: "allow" | "refuse";
}) => AgentContract;
export interface ExampleFinding {
    /** where in the schema tree, e.g. `root` or `root.properties.qty` */
    schemaPath: string;
    kind: 'example' | 'counterexample';
    /** index within the node's `examples` / `$counterexamples` array */
    index: number;
    /**
     * `rejected` — an example its own schema refuses (a lying spec);
     * `accepted` — a counterexample the gate lets through;
     * `unverifiable` — an example or counterexample that passes structurally
     * but the node carries a `$predicate` and no evaluator is registered, so
     * the computational half went unchecked — register an evaluator to settle it
     */
    problem: 'rejected' | 'accepted' | 'unverifiable';
    reasons?: string[];
}
/**
 * Lint a schema's own example data, recursively: every `examples` entry must
 * be accepted by the node that carries it, every `$counterexamples` entry
 * must be refused. Returns findings (empty = the spec doesn't lie). Runs
 * strict — an example a full scan would refuse is a lie even if sampling
 * might miss it.
 */
export declare function checkExamples(schemaOrBuilder: SchemaLike): ExampleFinding[];
