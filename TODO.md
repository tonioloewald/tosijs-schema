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
- [ ] Push `../tosijs-coding-practices` (KB commits are local-only until then).
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

## Docs / interop

- [ ] *(unverified)* Document the one-proposal-per-transaction protocol at the
  AgentContract seam (bulk per-path writes are O(N×M) with strict full-scan) —
  JSDoc + CONTEXT/README.
- [ ] *(unverified)* Memoize or deep-freeze `describe()`'s output instead of
  structuredClone per call (keep the clone on the way in).
- [ ] *(unverified)* Document the interop cost of `$`-prefixed keys in
  `describe()` output (Ajv's default strict mode rejects unknown keywords);
  consider a `describe({ strip: true })` option.
- [ ] Comment on tosijs#25: propose dropping/deprecating the now-vestigial
  `value` arg for contracted-root writes (adapter binds it as `_value`), or
  documenting it advisory-only, so the repos converge on one signature.
- [ ] Comment on tjs-lang#26 documenting both candidate `$predicate` dialects
  (function-cluster vs bare arrow) so the spec author sees them.

## Shared practices KB

Done — committed to `../tosijs-coding-practices` as `c8f5a95` (2026-08-06,
unpushed): fullScan→strict + maxProperties nuance, ValidateOptions-threading
gotcha, agentContract/examples conventions, dist/context.md drift-gate lesson,
review-lens-4 affected-versions rule, testing.md refused-input obligation.
Remaining there post-publish: close-the-loop items (strike tosijs-schema from
development.md's baseline-artifacts gap list when issue #1 closes; releasing.md
post-publish ownership note).
