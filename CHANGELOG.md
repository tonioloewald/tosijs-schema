# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.5.0] — 2026-08-06

> **Behavior-tightening release.** Several long-standing fail-open validator
> bugs are fixed; previously-passing data may now be refused. Read
> "Upgrading from 1.4.x" in the README before upgrading. The minor (not
> major) bump is deliberate: strict-by-default has been the documented
> behavior since 1.0 — the implementation is catching up to the contract.

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
- **Boolean schemas are now enforced** (ignored in all versions ≤ 1.4.0):
  `true` accepts everything, `false` accepts nothing — so the standard
  `properties: { key: false }` "forbidden key" idiom works.
- **`agentContract` construction now validates against an allowlist** (the
  exported `ENFORCED_KEYWORDS` set beside `validate`'s walk) instead of a
  hand-maintained denylist — typos (`minumum`), unimplemented spec keywords
  (`contentEncoding`, `$dynamicRef`), and future keywords are all refused
  rather than shipping as advertised-but-unenforced constraints. Non-primitive
  `const`/`enum` members and multi-type `type` arrays (which `validate`
  compares too naively to honor) are refused at construction too.
- **Invalid `pattern` regexes no longer throw**: `validate` fails closed
  (`Invalid pattern`) instead of raising `SyntaxError`, honoring the
  documented never-throws / `true | Error` contracts; `agentContract`
  additionally refuses invalid patterns at construction. (Threw in all
  versions ≤ 1.4.0.)
- `filter()` on typeless applicator schemas (a mid-1.5.0 regression):
  stripping now applies exactly where validation's applicators apply — the
  two walkers share applicability predicates so they cannot drift — and the
  caller's `strict` flag is threaded through union-branch filtering. When
  `additionalProperties` is itself a schema, conforming extras are now kept
  (filtered through that schema) instead of silently dropped.
- Multi-type `type` arrays enforce the first **non-null** entry, so
  `['null','string']` and `['string','null']` agree (the former previously
  refused every string).
- `agentContract` construction now also refuses: typeless nodes carrying
  constraints (per JSON Schema, applicators/`enum`/`$predicate` only apply
  when the value matches their type — so `null`/`undefined` and mismatched
  primitives would bypass them entirely; a whole-root `null` delete passed a
  typeless-root gate), malformed keyword value shapes (`anyOf: {}`,
  `required: 42` previously constructed and then made `check()` throw
  `TypeError`), and cross-type dead constraints (`minLength` on a `number`
  node). `check()`, `filter()`, and `checkExamples()` additionally wrap
  validation so internal errors fail closed as returned `Error`s/findings —
  never throws, as documented.
- `checkExamples()` now reports an example that passes structurally under an
  unevaluated `$predicate` as `unverifiable` instead of silently passing it
  (mirroring the counterexample path).
- **`anyOf` and `const` are constraints, not short-circuits** (fail-open in
  all versions ≤ 1.4.0): sibling keywords beside them were silently dead —
  `{ anyOf: [{type:'string'}], maxLength: 2 }` accepted `'xxxx'`. Siblings
  (including `$predicate`) are now enforced after the union/const check.
- **`filter()` prototype-pollution hardening** (all versions ≤ 1.4.0): an own
  `__proto__` key in JSON-parsed input replaced the returned object's
  prototype with attacker data. Filtered objects now receive keys as own data
  properties; the prototype is never touched.
- `filter()` applies `additionalProperties`-as-schema stripping with or
  without sibling `properties` (extras conforming to the subschema are kept,
  filtered through it).
- **`enum` now constrains `null`** per JSON Schema (bypassed in all versions
  ≤ 1.4.0): `{ type: ['null','string'], enum: ['a','b'] }` no longer accepts
  `null` — the enum must list `null` to allow it. The builder keeps
  `.optional`'s intent by appending `null` to the enum
  (`s.enum(['a']).optional` → `enum: ['a', null]`). Note: `$predicate` still
  does not run against `null`/`undefined` (they are settled by `type`
  before the predicate) — encode null-handling in the type, not the
  predicate.
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
