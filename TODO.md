# TODO

Follow-ups from the v1.5.0 pre-release review (items marked *(unverified)* are
reviewer leads — sanity-check before acting).

## Release checklist (at publish — human gate first)

- [ ] Push this repo + tag; `npm publish`.
- [ ] Publish a GitHub security advisory (GHSA) for the ≤ 1.4.0 fail-open
  bypasses (`additionalProperties: false` never enforced; prototype-named key
  bypass; boolean schemas ignored), affected ≤ 1.4.0, patched 1.5.0 — so
  audit/Dependabot tooling reaches consumers who never read changelogs.
- [ ] Mirror README's "Upgrading from 1.4.x" into the GitHub release notes;
  lead with the tosijs agent-surface unblock (#2). Note the "pin 1.4.0"
  escape hatch retains a known validation bypass — short-lived migration only.
- [ ] Close issues #1 and #2 naming v1.5.0.
- [ ] Push `../tosijs-coding-practices` (KB commits are local-only until then;
  includes the scoreboard row + gap-list annotation for this release).
- [ ] Update the KB scoreboard row's "publish pending" note once published.
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
