# TODO

Follow-ups from the v1.5.0 pre-release review (items marked *(unverified)* are
reviewer leads — sanity-check before acting).

## Correctness

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
  (+~18% gzipped). Add `"sideEffects": false` to package.json and/or split a
  `tosijs-schema/contract` subpath export.
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
- [ ] Consider wiring COVERAGE.md regeneration into `pack` (it was 6 months
  stale before the v1.5.0 refresh).

## Shared practices KB (`../tosijs-coding-practices` — needs its own commit there)

- [ ] `releasing.md`: add dist/context.md to the generated-artifacts-in-the-gate
  note ("seen in: tosijs-schema — v1.5.0 review caught a stale dist/context.md").
- [ ] `releasing.md`: confirm the human-only publish gate attribution now that
  this repo's CLAUDE.md records it explicitly.
- [ ] `state-and-schema.md`: replace `{ fullScan: true }` with `{ strict: true }`
  (fullScan is a deprecated alias).
- [ ] `state-and-schema.md`: add agentContract/checkExamples + the
  examples/`$counterexamples` conventions (strict-by-default rationale), and the
  gotcha "ValidateOptions must be threaded through every recursive validate()
  re-entry — strict silently reset to sampling inside anyOf branches until
  tosijs-schema 1.5.0; pin propagation with a test."
