# UPSTREAM

Issues filed on other repos from findings in this one (per the shared
practices: file, don't fix — never edit the other repo from here).

- ✅ [tosijs#25](https://github.com/tonioloewald/tosijs/issues/25) — Agent
  surface: pin the seam guarantee that contracted-root writes always carry a
  proposal (tosijs-side test). Companion to tosijs-schema 1.5.0's fail-closed
  hardening of `agentContract.check()` (missing proposal ⇒ protocol-breach
  Error). Filed 2026-08-06 from the v1.5.0 pre-release review.
- [tjs-lang#26](https://github.com/tonioloewald/tjs-lang/issues/26) — export a
  tosijs-schema-compatible `createPredicateEvaluator` and SPECIFY the
  `$predicate` source format (this repo's test stand-ins currently disagree:
  function-cluster vs arrow expression; docs say "evaluator-defined" pending
  this). Align stand-ins/docs to the canonical format when it lands. Filed
  2026-08-06 from the v1.5.0 pre-release review.
- [tjs-lang#32](https://github.com/tonioloewald/tjs-lang/issues/32) — asks what
  schema-cost / fuel-metering info the ajs VM wants now that tosijs-schema 1.8.0
  enforces the expensive `oneOf`. Rather than design a `schemaCost()`/cost-hook
  API blind, ask the consumer. `unenforcedKeywords()` (the detectability half of
  #8) ships in 1.8.0; the cost/fuel API waits on this answer. Filed 2026-08-23.
  Update (2026-08-24, v1.8.0 review): the review's DX concern that the `oneOf`
  cost warning re-spammed wire-parsed-per-request schemas is resolved in-repo —
  the nudge is now **once-per-process** (not keyed on schema-object identity),
  so #32 is now purely about the VM's cost/fuel-metering needs, not the warning.
- [tjs-lang#58](https://github.com/tonioloewald/tjs-lang/issues/58) (board #2416) — tjs-lang keeps
  local `x?.schema ?? x` unwraps, so tosijs-schema 1.12.0's #1390 fix (branded
  builders; ambiguous `{schema}` shapes refused) doesn't reach tjs users, and
  `Type('x', { name, schema })` wrappers now fail closed. Suggests switching to
  the exported `isBuilder`. Filed 2026-09-26 from the v1.12.0 pre-release review
  (tjs-lang's suite passes unchanged against 1.12.0).

## Third-party upstream

- **Bun: `bun build --outfile` ignores the output path when a sourcemap is
  requested.** This is [oven-sh/bun#19729](https://github.com/oven-sh/bun/issues/19729),
  open since Bun 1.2.12. A fix PR (#30884) was closed unmerged, and the
  fix is #41879 ("fixes #19729", with tests for `--outfile` × linked/external;
  open, awaiting review). We commented there on 2026-10-03 noting our
  workaround and that we'd drop it once the fix lands. We commented on 2026-10-02 confirming it on 1.4.2,
  and added a symptom the issue didn't record: with `--sourcemap=external`,
  nothing is written at all, and both commands exit 0. (An earlier note here
  called it "fixed upstream in Bun 1.4", which was wrong.) `pack` works around
  it by building the infer subpath with `--outdir=dist` (board: "Simplify
  `pack`", blocked on this).
