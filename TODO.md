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

- [ ] *(unverified)* anyOf **and now oneOf** branch trials allocate a fresh
  `{ strict }` options object + full `validate()` closure environment per branch
  per element (oneOf re-enters public `validate()` once per branch, same
  pattern, added in 1.8.0). Hoist one shared options object; longer-term let
  `walk()` handle both unions internally instead of re-entering `validate()`.
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

**KB write-back log** (reviewed-repo `base..sha` → KB commit):
- v1.6.0 review (`v1.5.1..142e007`) → KB `50580f9`.
- v1.7.0 review (`v1.6.1..894b3ff`) → KB `f8e3cac` (1.7.0 positive citation, infer
  subpath size fix).
- v1.8.0 review (`v1.7.0..0da18e9`) → KB `58ece17` (break-frequency
  ship-now-cannot-batch; generate-your-own-numbers + make-coverage.ts;
  decided-against-note lesson; fail-open enumerator pattern; scoreboard → 1.8.0).

## ~~Decided: no `oneOf` support~~ — SUPERSEDED by v1.8.0 (2026-08-23)

The 2026-08-19 decision below was reversed four days later by issue #8: a real
consumer (tosijs-ui's `<tosi-schema-form>`) was silently under-served because
`validate` fail-open-ignored `oneOf`. v1.8.0 implemented it (evaluate all
branches, require exactly one match) rather than continue to silently ignore —
the "hidden hole" the note below called benign turned out to be the #8 bug. The
"prefer `anyOf`" guidance was kept as a *suppressible cost warning* (`oneOf`
can't short-circuit), and `agentContract` now ACCEPTS `oneOf` instead of
refusing it. Left here (struck, not deleted) as a worked example for the
practices lens: a "decided against" note is only as good as the assumption it
rests on — here, that no consumer needed off-the-wire `oneOf`.

Original note (2026-08-19), now historical: `oneOf` deliberately omitted —
`anyOf` covers real unions, mutual-exclusion is a footgun
(`oneOf:[number,integer]` rejects `5`), can't short-circuit. Posture was "README
unsupported + `agentContract` refuses + `validate` silently ignores." The
reconsider-if trigger it named ("a consumer needs to validate EXTERNAL JSON
Schema off the wire") is essentially what #8 turned out to be.

## v1.8.0 pre-release review follow-ups (non-blocking; blocker fixed pre-tag)

The `depth: fast` review (base `v1.7.0`) found ONE blocker — `filter()` silently
dropped a required field on valid overlapping-`oneOf` input (a data-loss
regression from wiring `filterData` to `oneOf`). Fixed pre-tag: `filterData`
now strips `oneOf` against the branch the ORIGINAL data matches and, when only
stripped candidates fit, keeps the one retaining the most data — never sheds a
field a valid interpretation keeps (`src/schema.ts`, regression test in
`coverage.test.ts`). Also fixed pre-tag from the same review: the two verified
coverage gaps (nested-in-`oneOf` honesty-walk test + `oneOf` strict-propagation
test), the `oneOf` warning leaking into `bun test` output, the warning re-spam
on wire-parsed schemas (now **once-per-process**, not per-node), and the stale
doc counts / bundle-size row.

Fixed pre-tag in the Run-2 pass too: the dead `s` param on `warnExpensive`
(dropped), the break-at-2 short-circuit in `filterData`'s `origMatches` loop,
the stale `oneOf` in CONTEXT.md's "complex corners" list, and — the confirmed
practices-major — the review record is now persisted under `reviews/`
(`reviews/1.8.0-oneof-exclusive-enforcement.md`; `reviews/` is excluded from the
npm tarball by the `package.json` "files" allowlist).

Remaining (unverified reviewer leads unless noted — sanity-check first):

- [ ] *(correctness lead)* `filterData`'s `oneOf` retention score `size()`
  (`src/schema.ts`) counts only TOP-LEVEL keys, so `filter()` over-rejects
  `oneOf` inputs whose unique valid stripping differs only in NESTED structure
  (e.g. `oneOf:[{a:{x}},{a:{x,y}}]`, input `{a:{x,y,z}}` → tie at size 1 → Error).
  Fails SAFE (Error, never a wrong value — no data corruption). Verify, then
  either make the score a recursive node count or document that `filter()` can't
  resolve nested-only `oneOf` differences and returns an Error. Add a
  nested-difference fixture either way.
- [ ] *(dryness nit — LEAN NO)* `anyOf` and `oneOf` branch-trial loops in
  `validate()` are near-duplicate. Reviewer recommends leaving them as two
  explicit loops (merging obscures the short-circuit-vs-full-count distinction);
  extract a shared `countMatches(v, branches, cap)` only if a third union
  keyword lands.
- [x] *(practices minor)* Reverse-lens-8 disposition done — see the "Shared
  practices KB … `58ece17`" section below: fe03680 ADOPTED, 787c551 COMPLIANT,
  abdcf14 ADOPTED (deciding rule for GHSA→CHANGELOG-only), break-frequency
  recorded as a stated "ship-now-cannot-batch" divergence in releasing.md.
- [x] *(tooling — recurring)* Resolved: `make-coverage.ts` regenerates the
  COVERAGE.md counts/table + README size row from measured output, wired into
  `bun run pack`, so the drift gate now covers them. Stamps the VERSION (not a
  date) to stay gate-clean day-to-day. Corrected two hand-rounding errors it
  found (98.53→98.59%, 7.8→7.9 kB).
- [x] *(nit)* KB write-back ledger (below): backfilled v1.6.0/v1.7.0 with pinned
  `base..sha`, added the v1.8.0 → `58ece17` entry. All rows range-checkable now.

### At publish time (human)

- [x] Closed **#8** naming v1.8.0 (2026-08-24) with honest scope: `oneOf` +
  `exclusive*` now ENFORCED and `unenforcedKeywords()` shipped (all three
  prioritized asks); the ~10 other keywords remain unenforced but detectable.
  (Incoming issue on this repo — no UPSTREAM.md mirror needed.)
- [x] GHSA vs CHANGELOG decision (2026-08-24): **CHANGELOG-only**, no second
  advisory. Owner confirmed nothing downstream treats `validate()`'s boolean as
  an auth/sanitize boundary; under `^1.x` every consumer floats to 1.8.0, so the
  ≤1.7.0 versions fail practice abdcf14's deprecate/advisory bar (that bar is
  only for consumers who *can't* reach the fix). Documented as BREAKING in
  CHANGELOG + README "Upgrading to 1.8.0"; same defect class as
  GHSA-3qw7-pvr3-2gpq, further narrowed.

### Shared practices KB (committed to `../tosijs-coding-practices` as `58ece17` — human pushes)

All four write-backs + the scoreboard refresh landed in KB commit `58ece17`
(ahead of origin; needs a human `git push`). The stamp-or-generate item was
resolved by *building* the generator (make-coverage.ts) rather than just
recording a divergence.

- [x] **Disposition the break-FREQUENCY trigger.** releasing.md now records the
  "ship-now-cannot-batch" rule: the batch-into-a-major trigger is subordinate to
  the CLASS distinction — a fail-open fix can't be batched (its deprecation
  window is the forbidden "keep the vulnerability" opt-in), so on a mixed-class
  run you batch the conformance breaks and ship the fail-open ones now. Citation
  updated to three breaking minors; scoreboard row refreshed to 1.8.0.
- [x] **"Generate perishable-and-yours facts."** documentation-surface.md move 1
  now covers your OWN measured numbers (bundle size, test/coverage counts) with
  the version-not-date stamp caveat, citing make-coverage.ts. Resolved in-repo
  by the generator (this repo's `build:` commit), not by a recorded divergence.
- [x] **"Decided-against note" lesson.** development.md new section — a
  decided-against note is only as strong as its reconsider-if trigger; a
  triggerless one calcifies. Cites the `oneOf` reversal.
- [x] **Fail-open ENUMERATOR pattern.** review.md now records the third form of
  a fail-open fix (beyond enforce-or-refuse): make the gap enumerable —
  allowlist → refuse → enumerate (`unenforcedKeywords`), "detectability > coverage."
- [x] **Reverse lens-8 disposition** (see the review-follow-ups section above):
  in-window practices commits dispositioned — fe03680 (reviews/ path) ADOPTED
  (record now filed); 787c551 (land-current-release-first) COMPLIANT (human-only
  push/publish gate already satisfies it); abdcf14 (npm-deprecate bar) ADOPTED as
  the deciding rule for the GHSA→CHANGELOG-only call; break-frequency recorded as
  a stated "ship-now-cannot-batch" divergence from releasing.md (above).

## Build / tooling (future)

- [ ] Simplify `pack`: the infer-subpath build uses `--outdir=dist` (not
  `--outfile=dist/infer.js`) to dodge a bun bug where `--outfile` +
  `--sourcemap=linked` left a stray `src/infer.js`. **Fixed in bun 1.4.** Once
  we drop support for bun ≤ 1.3.x, revert to `--outfile=dist/infer.js` for
  clarity. Keep the workaround while older bun is supported. (Verified fixed on
  bun 1.4.0, 2026-08-21.)
