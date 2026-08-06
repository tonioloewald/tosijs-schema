# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.5.0] — 2026-08-06

### Added

- `agentContract(schemas, options?)` — adapter for capability-gated write paths
  (e.g. the tosijs agent surface, [#2](https://github.com/tonioloewald/tosijs-schema/issues/2)):
  `check(path, value, proposal?)` judges a proposed whole-root value and returns
  `true` or an `Error` carrying the refusal reason; `describe()` returns the
  serializable per-root contract. Fail-closed by construction: schemas are
  deep-copied at both seams (no caller-side mutation can disarm the gate),
  schemas using keywords `validate` does not enforce (`allOf`, `oneOf`, `not`,
  `$ref`, `exclusiveMinimum`/`Maximum`, …) are refused at construction, and a
  contracted-root write arriving without a proposal is refused as a protocol
  breach. Strict validation by default; `{ strict: false }` opts into sampling.
- `checkExamples(schema)` — definition-time lint: every `examples` entry must
  pass its own schema node, every `$counterexamples` entry must fail.
  Counterexamples that pass structurally under a `$predicate` with no
  registered evaluator report `unverifiable` rather than `accepted`.
- `$counterexamples` convention (values a schema must refuse), typed on the
  `JSONSchema` interface alongside a `` `$${string}` `` index signature.
- Documented, test-pinned guarantee: `validate` ignores — and never mutates —
  unrecognized `$`-prefixed and `x-*` extension keys.
- `CHANGELOG.md` and `llms.txt`
  ([#1](https://github.com/tonioloewald/tosijs-schema/issues/1)).

### Fixed

- **`additionalProperties: false` is now enforced** (fail-open in all
  versions ≤ 1.4.0). Previously the falsy check `if (s.additionalProperties)`
  skipped it entirely, so every `s.object()` schema (which emits it by
  default) silently accepted unknown keys. Unknown keys now fail with
  `Unexpected <key>`. Affects all `validate` consumers — data that previously
  passed with smuggled extras will now be refused (use `filter()` to strip
  extras instead). See "Upgrading from 1.4.x" in the README.
- **Prototype-named keys are treated as data** (fail-open in all versions
  ≤ 1.4.0, and in the initial 1.5.0 `additionalProperties` fix): key
  membership now uses `hasOwnProperty`, so keys like `constructor` /
  `toString` can no longer bypass `additionalProperties: false`, vacuously
  satisfy `required`, or dodge per-property validation.
- `minItems` / `maxItems` are now enforced on array schemas without an
  `items` schema (`{ type: 'array', minItems: 1 }` previously accepted `[]`;
  fail-open in all versions ≤ 1.4.0).
- Typeless schemas now apply object/array keywords when the value matches,
  per JSON Schema semantics: `{ properties, required }` without
  `type: 'object'` previously skipped enforcement entirely when handed an
  object.
- `filter()` now strips extras *before* validating (so
  `additionalProperties: false` doesn't refuse the very extras filtering
  exists to remove) and strips through `anyOf` against the first branch the
  stripped data satisfies.
- `strict` / `fullScan` now propagates into `anyOf` branch validation.
  Previously, strict mode silently reverted to stride sampling inside union
  branches, so a bad element at an unsampled index of a large array could pass
  even with `{ strict: true }`. Affects all `validate` consumers.
- `agentContract` gate hardening: a proposal whose `root` doesn't match the
  contracted root the write lands under is refused (a typo'd or adversarial
  `proposal.root` cannot disarm the gate); writes *above* a contracted root —
  including the empty path — fail closed unless they carry a proposal for the
  affected root, and ancestor writes spanning several contracted roots are
  refused outright (one proposal can't cover them); nested contracted roots,
  `format` values outside `ENFORCED_FORMATS`, uncapped tuple `items`, and
  `additionalItems`/`dependencies` are refused at construction; a contracted
  schema carrying `$predicate` refuses writes while no evaluator is
  registered rather than silently skipping the predicate.
- The `pack` release pipeline now regenerates `dist/context.md`
  (via `make-context.ts`), which had been stale since v1.0.x.

## [1.4.0] — 2026-07-03

### Added

- `$predicate` keyword — pluggable computational validation. Inert until a
  consumer registers an evaluator via `setPredicateEvaluator()`; naive
  validators ignore it (progressive enhancement).

## [1.3.0] — 2026-07

### Added

- Exported `JSONSchema` interface; replaced `schema: any` typings.
- TypeBox added to benchmarks and comparison docs; runtime-schema benchmark.

## [1.2.0] — 2026-07

### Added

- Strict mode (`{ strict: true }`), disabling stochastic sampling.

### Fixed

- Assorted validation bugs.

[1.5.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.5.0
[1.4.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.4.0
