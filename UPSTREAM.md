# UPSTREAM

Issues filed on other repos from findings in this one (per the shared
practices: file, don't fix — never edit the other repo from here).

- [tosijs#25](https://github.com/tonioloewald/tosijs/issues/25) — Agent
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

## Resolved / no issue filed

- **Bun `--outfile` build glitch** (seen while verifying a standalone build during
  the 1.8.0 work): fixed upstream in Bun 1.4; no issue filed. Left here so a future
  reviewer who hits the old symptom on an older Bun knows the fix is "upgrade Bun".
