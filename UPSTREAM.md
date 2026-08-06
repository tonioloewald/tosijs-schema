# UPSTREAM

Issues filed on other repos from findings in this one (per the shared
practices: file, don't fix — never edit the other repo from here).

- [tosijs#25](https://github.com/tonioloewald/tosijs/issues/25) — Agent
  surface: pin the seam guarantee that contracted-root writes always carry a
  proposal (tosijs-side test). Companion to tosijs-schema 1.5.0's fail-closed
  hardening of `agentContract.check()` (missing proposal ⇒ protocol-breach
  Error). Filed 2026-08-06 from the v1.5.0 pre-release review.
