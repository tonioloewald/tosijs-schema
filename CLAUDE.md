# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Related docs (read these too)

- **`AGENTS.md`** — points to shared engineering practices at [tosijs-coding-practices](https://github.com/tonioloewald/tosijs-coding-practices) (checked out beside this repo at `../tosijs-coding-practices` when available). Those are the cross-project defaults; this repo's docs win on conflict. The practices docs are living documents — suggest improvements, don't rewrite unprompted.
- **`CONTEXT.md`** — the detailed architecture/usage doc for this library, maintained by hand and bundled (with generated `examples.md`) into `dist/context.md` for consumers via `make-context.ts`. Keep it in sync with behavioral changes.

## Commands

Use **Bun** for everything (never node/npm/pnpm/vite — see `.cursor/rules/`).

```sh
bun test                        # run all tests
bun test src/schema.test.ts     # run one test file
bun test -t "name"              # run tests matching a name
bun tsc --noEmit                # type-check, including the type-level tests
bun bench.ts                    # benchmarks vs Zod/TypeBox
bun examples.ts > examples.md   # regenerate examples doc
bun run pack                    # full pipeline: tests + typecheck + bench + examples + build to dist/
```

**Do not run `src/inference.types.ts` with Bun.** It is a type-level test file full of intentional `@ts-expect-error` cases, exercised only by `tsc --noEmit`.

## What this library is

A ~7kB-gzipped (tree-shakeable) **schema-first** validation library: plain JSON Schema objects are the source of truth; TypeScript types are inferred from them (`Infer<typeof Schema>`). It is validation-only — no coercion, no `z.transform()`-style logic, ever. Strict by default: objects get `additionalProperties: false` and all keys required (`.open` / `s.object(props, { additionalProperties: true })` opts a single object into admitting unknown keys, for protocols you don't control).

Public API is `index.ts` re-exporting `src/schema.ts`, `src/monad.ts`, `src/contract.ts`, and `src/infer.ts`. `sideEffects: false` + per-concern modules make named imports tree-shakeable; `inferSchema` is also a self-contained `tosijs-schema/infer` subpath (~1.3kB), built separately in `pack`. Its only runtime dependency is the tiny `src/formats.ts` (shared format predicates); keep it that way — pulling in `schema.ts` would blow up the subpath.

## Architecture

### `src/schema.ts` — builder + validator (the whole core)

- **The builder `s`** is a Proxy producing fluent schema builders (`s.string`, `s.email`, `s.object({...})`, `.min()`, etc.). Two-layer design: a recursive `Base<T>` interface ("the Lie") exists purely for TypeScript inference, while `create()` ("the Truth") builds the actual plain-JSON schema object. Builders expose `.schema` (plain JSON) and `.validate(data)` for convenience.
- **`validate(value, schemaOrBuilder, options?)`** returns boolean, never throws (invalid `pattern` regexes fail closed), keeps allocation minimal, and accepts plain JSON schemas — including boolean schemas — received at runtime (over the wire, from a DB) with zero preprocessing — a core selling point, don't break it.
- **Stochastic sampling**: arrays/dictionaries larger than 97 items are validated at prime-stride (97) sampled indices in O(1) unless `{ strict: true }` is passed (`fullScan` is a deprecated alias). `maxProperties` is a "ghost constraint" — kept in the schema but ignored outside strict mode to avoid O(N) key counting (strict — agentContract's default — enforces it).
- **`$predicate`** (v1.4.0): pluggable computational validation. The keyword is inert until a consumer calls `setPredicateEvaluator()` to install an evaluator; then it runs against type-valid values.
- **Gotcha**: `s.any` produces the empty schema `{}`; the validator has special-case logic allowing `null`/`undefined` when no `type` is present. `validate` is defined after `create` but attached via closure — refactoring declaration order needs care.

### `src/infer.ts` — data → schema

`inferSchema(sample, opts?)` derives a JSON Schema from example data (runtime inverse of `Infer<S>`). Structure only (never invents range constraints), unifies across every array element, presence decides `required`, objects open (`additionalProperties: true`), heterogeneous same-position data becomes `anyOf`. Its only runtime import is the tiny `src/formats.ts` (below), so it still ships as the ~1.3kB `tosijs-schema/infer` subpath — don't import anything from `schema.ts` here. Invariant: `validate(sample, inferSchema(sample))` is always true — any change must preserve it (the suite asserts it over every fixture, incl. mixed kinds and `formats:true`). The old `s.infer` builder method is the deprecated first-element/closed version; leave it, steer to `inferSchema`.

### `src/formats.ts` — the one format-predicate source

String `format` validators (`email`/`uri`/`date-time`/…) plus `ENFORCED_FORMATS`, imported by **both** `schema.ts` (the enforcer) and `infer.ts` (the sniffer). This shared origin is load-bearing: it guarantees a sniffed format is a subset of the enforced one, so an inferred schema can never reject its own sample. Keep it dependency-free (it's the reason the infer subpath stays tiny).

### `src/contract.ts` — agent-surface contracts

`agentContract(schemas)` adapts root-path → schema maps into the contract seam tosijs's agent surface consumes (`check` returns `true | Error`-with-reason on a whole-root proposal; `describe` returns the plain-JSON contract). Strict validation by default — a gate that samples isn't a gate. `checkExamples()` lints `examples` (must pass) and `$counterexamples` (must fail) across the schema tree; predicate-dependent counterexamples with no evaluator registered report `unverifiable`. `validate` guarantees unknown `$`-prefixed and `x-*` keys pass through untouched — that guarantee is documented and test-pinned; don't break it.

### `src/monad.ts` — railway-oriented pipelines

`M.func(InputSchema, OutputSchema, impl, timeoutMs?)` wraps a function with schema-validated I/O and a timeout (default 5000ms); `new M(registry)` builds async fluent chains where a `SchemaError` bypasses subsequent steps. Types are inferred from the schemas.

### Tests

- `src/schema.test.ts`, `src/coverage.test.ts` — validator behavior; `src/any.test.ts` — `s.any`; `src/monad.test.ts` — pipelines; `src/predicate.test.ts` — `$predicate`; `src/contract.test.ts` — `agentContract`, `checkExamples`, `$`-key passthrough; `src/infer.test.ts` — `inferSchema` (incl. the accept-your-own-sample property).
- `src/inference.types.ts` — compile-time-only type inference tests (tsc, not bun).
- High coverage is a marketed feature (schemas are data flowing through tested code) — keep it that way.

## Releasing

`bun run pack` is the prepublish gate (runs everything, regenerates `examples.md` and `dist/context.md`, builds ESM + CJS + declarations into `dist/`, incl. the `tosijs-schema/infer` subpath). Before a minor/major bump, run the `pre-release-review` skill (part of the shared practices process). Update `CHANGELOG.md` and `llms.txt` with every release.

**Versioning threshold (this repo):** a validator getting *stricter* is treated as **breaking** even though semver's letter calls it additive — it fails a consumer's next install. This project carries breaking changes in **minor** bumps, but every one must be CHANGELOG'd as BREAKING with a before→after migration note (the CHANGELOG ships in the tarball, so it's reachable from what a consumer installed). Loosening / new API is an ordinary minor. Deprecate before removing. See README "Versioning & stability".

**Drift gate:** after the final `bun run pack`, `git status --porcelain` must be empty before tagging — if it isn't, a generated artifact (examples.md, dist/, COVERAGE numbers, llms.txt version) is stale in the commit.

**Publishing and pushing are human-only.** Stop after commit + tag and wait for an explicit go-ahead; never run `npm publish`/`bun publish` or `git push` yourself.
