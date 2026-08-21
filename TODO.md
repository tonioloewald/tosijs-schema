# TODO

Follow-ups from the v1.5.0 pre-release review (items marked *(unverified)* are
reviewer leads — sanity-check before acting).

## Release checklist

- [x] Push this repo `main` + `v1.5.0` tag (2026-08-07).
- [x] `npm publish` — live as `latest` (2026-08-07); tarball verified to
  ship the new API + CHANGELOG.md + llms.txt + dist/context.md.
- [x] Draft GHSA filed for the ≤ 1.4.0 fail-open bypasses:
  [GHSA-3qw7-pvr3-2gpq](https://github.com/tonioloewald/tosijs-schema/security/advisories/GHSA-3qw7-pvr3-2gpq)
  (severity high, CWE-20 + CWE-1321, patched 1.5.0). **Human: review + publish
  the advisory** — drafts are not visible to Dependabot/npm audit until published.
- [x] GitHub release notes published for v1.5.0 (2026-08-07): agent-surface
  unblock (#2) lead, GHSA security callout, "Upgrading from 1.4.x" guidance.
- [x] Closed issues #1 and #2 naming v1.5.0 (2026-08-07).
- [x] Pushed `../tosijs-coding-practices` (2026-08-07).
- [x] Updated the KB scoreboard row to published (2026-08-07).
- [ ] Verify tosijs's dependency pin picks up 1.5.0 (its `one-user-interface`
  contract suite passed 24/24 against this tree pre-release).

## Correctness

- [ ] *(unverified)* `additionalProperties: false` sweep uses `for..in`, so
  non-enumerable own properties escape the `Unexpected` refusal — reachable
  only via live JS objects, not JSON. Use `Object.getOwnPropertyNames` or
  document that `proposed` must be JSON-clean.
- [ ] Implement real multi-type `type` array semantics (membership across
  entries) and deep-equality `const`/`enum`, then relax the corresponding
  construction refusals in `agentContract`.

- [ ] *(unverified)* `hasPredicate` over-approximates reachability: a
  `$predicate` in unreferenced `$defs` / `not` makes `checkExamples` report
  `unverifiable` when the counterexample is genuinely accepted regardless of
  evaluator. Restrict to subtrees `validate` executes; add a
  $defs-predicate-no-evaluator test asserting `accepted`. (Mostly moot for
  `agentContract`, which now rejects those keywords at construction, but
  `checkExamples` still lints arbitrary schemas.)

## Efficiency

- [ ] *(unverified)* anyOf branch trials allocate a fresh `{ strict }` options
  object + full `validate()` closure environment per branch per element.
  Hoist one shared options object; longer-term let `walk()` handle anyOf
  internally instead of re-entering `validate()`.
- [ ] *(unverified)* Contract/lint tooling ships in the runtime entry
  (+~18% gzipped). `sideEffects: false` landed in 1.5.0; consider a
  `tosijs-schema/contract` subpath export split.
- [ ] *(unverified)* Document `check()`'s cost model in README (O(root size)
  per write): contract fine-grained roots; reserve `strict: false` for huge
  roots; note surface-side batching in CONTEXT.md for the tosijs consumer.
- [ ] *(unverified)* `hasPredicate` recomputed per passing counterexample
  (O(k·n) re-walks, double `subschemas()` calls). Memoize per node.

## DRYness

- [ ] *(confirmed by inspection)* `enforcedChildren` (contract.ts) is a third
  hand-maintained encoding of validate's recursion, already micro-drifted from
  `subschemas`. Move one exported child-walk into schema.ts beside the walk
  (where ENFORCED_KEYWORDS lives for the same anti-drift reason); have
  `subschemas` extend it with lint-only keys.
- [ ] *(unverified)* Export one `compilePattern(s)` from schema.ts with a
  module-level cache keyed by pattern+flags — kills the duplicated compile
  expression (schema.ts/contract.ts) and the per-value hot-path compile.

- [ ] *(unverified)* Builder-unwrap idiom in 3 places with drifted semantics
  (`?? ` in contract.ts vs `||` in validate/filter). Export one `toPlain()`
  from src/schema.ts and use everywhere.
- [ ] *(unverified)* "validate and collect reasons" duplicated in `check()`
  and `checkExamples()` (echoes filter()'s captureError). Extract a local
  `tryValidate` helper.
- [ ] *(unverified)* The length-500/bad-index-3 stride-probe fixture is
  copy-pasted in 3+ tests. Extract an `unsampledBadArray()` helper with a
  STRIDE=97 comment.

## Coverage

- [ ] *(unverified)* `subschemas()` walks keywords neither the builder emits
  nor the validator enforces, with no tests on those branches; `checkExamples`
  traversal is only tested through `properties`. Trim to the supported subset
  or test every kept branch; add lying-example tests under `items`, `anyOf`,
  and `$defs` asserting `schemaPath`.
- [ ] *(unverified)* `hasPredicate` descendant recursion untested — add a
  parent-counterexamples/child-predicate test.
- [ ] *(unverified)* Pin `subschemas()` recursion branches with tests (tuple
  items, prefixItems, object-valued additionalProperties, $defs — currently
  uncovered).
- [ ] *(unverified)* Add a type-level test for the `` `$${string}` `` index
  signature on `JSONSchema` in `src/inference.types.ts`.
- [ ] Consider wiring COVERAGE.md regeneration into `pack` (it was 6 months
  stale before the v1.5.0 refresh).

- [ ] *(unverified)* `filter`'s anyOf fallback returns the ORIGINAL unstripped
  data when every stripped candidate fails its branch — extras can survive a
  "successful" filter. Keep required-listed keys in candidates, or make the
  fallback detectable.
- [x] filterData `setKey` fast-paths plain assignment except `'__proto__'`
  (wave 8); `additionalProperties: true` extras kept (spec ≡ `{}`).
- [ ] *(confirmed by probe)* filterData's anyOf branch doesn't apply sibling
  applicators after branch selection — filter can refuse (`Unexpected junk`)
  where validate accepts the stripped result. Fail-closed, but drifts from
  the anyOf-sibling semantics. Mirror validate's fall-through; add a test.
- [ ] *(unverified nit)* `properties: {key: false}` makes filter return an
  Error instead of stripping the forbidden key. Decide strip-vs-refuse; pin.
- [ ] *(unverified nit)* `describe()` structuredClones per call; add a cheap
  `roots()` accessor for callers that only need the contracted-root list.

## Docs / interop

- [ ] *(unverified)* anyOf refusals carry no branch detail ("Union mismatch"
  only) — on all-branches-fail with onError registered, surface per-branch or
  best-branch reasons. Matters for union-rooted contracts.
- [ ] *(unverified)* `filter()` double-validates union data (branch selection
  + final validate) — have filterData signal already-proven results.
- [ ] *(unverified)* Sampled mode still walks every key of a
  properties+additionalProperties object to build the extras list — document
  the cost nuance; add a large-dict case to bench.ts.

- [ ] *(unverified)* Document the one-proposal-per-transaction protocol at the
  AgentContract seam (bulk per-path writes are O(N×M) with strict full-scan) —
  JSDoc + CONTEXT/README.
- [ ] *(unverified)* Memoize or deep-freeze `describe()`'s output instead of
  structuredClone per call (keep the clone on the way in).
- [ ] *(unverified)* Document the interop cost of `$`-prefixed keys in
  `describe()` output (Ajv's default strict mode rejects unknown keywords);
  consider a `describe({ strip: true })` option.
- [x] Commented on tosijs#25 (type-conformance test ask + vestigial `value`
  arg) and tjs-lang#26 (both `$predicate` dialects) — 2026-08-06.

- [ ] *(unverified)* filterData's anyOf branch skips sibling applicators —
  filter can error where validate accepts the stripped result. Mirror
  validate's fall-through; add a test.
- [ ] *(unverified)* filter() does 3-4 validation passes per anyOf item;
  record the matched branch or share one walk.

## Process

- [ ] Encode two review lessons into the pre-release-review workflow script
  (`~/.claude/skills/pre-release-review/`): (1) lens prompts instruct a
  class-sweep on any fail-open finding (enumerate every keyword/default/
  shape/branch of the same enforcement path in one pass); (2) a
  falsifies-documented-guarantee trigger so such leads are adversarially
  verified even at depth=fast. Both lessons are recorded in
  practices/review.md; the workflow file is the human's to edit.

## Shared practices KB

Done through wave 5 — committed to `../tosijs-coding-practices` as `c8f5a95`
(waves 1-2 lessons), `b60844d` (verification tiering), `4d518c8`
(allowlist-not-denylist superseding the wave-2 denylist lesson;
enumerate-the-fail-open-class; lens-8 wave-currency + push-state). The KB
checkout is AHEAD OF ORIGIN and needs a human push (see release checklist).
Remaining there post-publish: strike tosijs-schema from development.md's
baseline-artifacts gap list when issue #1 closes; releasing.md post-publish
ownership note.

## v1.6.0 pre-release review follow-ups (non-blocking; majors M1–M4 fixed pre-tag)

Fixed before the 1.6.0 tag: M1 (mixed array/non-array → anyOf), M2/M3 (shared
`formats.ts` so a sniffed format is a subset of the enforced one),
M4 (llms.txt version stamped by `make-context.ts`, drift gate now covers it).

Remaining (unverified reviewer leads — sanity-check first):

- [ ] *(efficiency)* `walk()` allocates a `typeMatches` closure per node even
  on the single-type fast path (`src/schema.ts`). Hoist a two-arg
  `typeMatches(v, ty)` or gate on `listed.length`. Profile first.
- [ ] *(efficiency)* `inferSchema` `flat()`s array elements before applying
  `sampleSize`; slice per source array before flattening so truncation bounds
  the O(n) copy.
- [ ] *(dryness)* `s.infer` re-implements the classification `inferSchema` now
  owns; consider delegating or scheduling removal (JSDoc `@deprecated` only is
  the current house convention — confirm).
- [ ] *(coverage pin, from the v1.5.0-review practice)* validate a >97-item
  array under a multi-type union with `{ strict: true }` to prove option
  propagation survives the new inline union dispatch (impl looks correct — no
  `validate()` re-entry — but the practice mandates a fails-if-dropped pin on
  every new dispatch path).
- [ ] *(coverage)* a multi-type schema carrying a scalar constraint
  (`{ type: ['string','number'], minLength: 3 }`) to lock constraints-on-the-
  matched-branch.

### Shared practices KB (commit to `../tosijs-coding-practices`)

Landed in the KB during the v1.6.0 review (KB commit `50580f9`) and the v1.7.0
review (KB commits `50580f9`, `f8e3cac`); all three ticked:

- [x] `releasing.md`: a drift gate built on "regenerate + `git diff`" protects
  only GENERATED artifacts; a hand-maintained field it *names* is false
  assurance (llms.txt version stale through two releases).
- [x] `releasing.md`: ship the escape hatch in the SAME release as the
  tightening — with 1.7.0 added as the positive counterpart (`format:'date'`
  shipped atomically with the `date-time` tightening).
- [x] `state-and-schema.md`: `inferSchema` / the `/infer` subpath added; steer
  away from the deprecated `s.infer`.

**KB write-back log** (base..sha, this repo):
- v1.6.0 review → KB `50580f9`.
- v1.7.0 review (`v1.6.1..HEAD`) → KB `f8e3cac` (1.7.0 positive citation, infer
  subpath size fix).

## Decided: no `oneOf` support (unless a real need)

`oneOf` (matches *exactly one* subschema) is deliberately omitted — `anyOf`
(via `s.union`) covers real unions, `oneOf`'s mutual-exclusion is a footgun
(overlapping branches reject valid data, e.g. `oneOf:[number,integer]` rejects
`5`), and it can't short-circuit (must evaluate every branch — wrong for the
stride-sampling hot path). Current posture is consistent: README documents it
unsupported, and `agentContract` refuses it at construction so no gate can
advertise-but-not-enforce it. Standalone `validate` silently ignores it (the
documented "unknown keywords pass through" behavior), which is a benign
under-enforcement rather than a hidden hole.

**Only reconsider if** a consumer needs to validate EXTERNAL JSON Schema off
the wire (OpenAPI docs etc. do use `oneOf`) — there the silent-ignore in
`validate` becomes a real gap. Then it's ~10 lines (evaluate all branches,
require exactly one match); pair with keeping the "prefer `anyOf`" guidance.
Decided 2026-08-19.

## Build / tooling (future)

- [ ] Simplify `pack`: the infer-subpath build uses `--outdir=dist` (not
  `--outfile=dist/infer.js`) to dodge a bun bug where `--outfile` +
  `--sourcemap=linked` left a stray `src/infer.js`. **Fixed in bun 1.4.** Once
  we drop support for bun ≤ 1.3.x, revert to `--outfile=dist/infer.js` for
  clarity. Keep the workaround while older bun is supported. (Verified fixed on
  bun 1.4.0, 2026-08-21.)
