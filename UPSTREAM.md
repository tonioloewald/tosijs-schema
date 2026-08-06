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
