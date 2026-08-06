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

A ~5kB (gzipped) **schema-first** validation library: plain JSON Schema objects are the source of truth; TypeScript types are inferred from them (`Infer<typeof Schema>`). It is validation-only — no coercion, no `z.transform()`-style logic, ever. Strict by default: objects get `additionalProperties: false` and all keys required.

Public API is just `index.ts` re-exporting `src/schema.ts`, `src/monad.ts`, and `src/contract.ts`.

## Architecture

### `src/schema.ts` — builder + validator (the whole core)

- **The builder `s`** is a Proxy producing fluent schema builders (`s.string`, `s.email`, `s.object({...})`, `.min()`, etc.). Two-layer design: a recursive `Base<T>` interface ("the Lie") exists purely for TypeScript inference, while `create()` ("the Truth") builds the actual plain-JSON schema object. Builders expose `.schema` (plain JSON) and `.validate(data)` for convenience.
- **`validate(value, schemaOrBuilder, options?)`** returns boolean, never throws, allocates nothing, and accepts plain JSON schemas received at runtime (over the wire, from a DB) with zero preprocessing — a core selling point, don't break it.
- **Stochastic sampling**: arrays/dictionaries larger than 97 items are validated at prime-stride (97) sampled indices in O(1) unless `{ strict: true }` is passed (`fullScan` is a deprecated alias). `maxProperties` is a "ghost constraint" — kept in the schema but deliberately ignored at runtime to avoid O(N) key counting.
- **`$predicate`** (v1.4.0): pluggable computational validation. The keyword is inert until a consumer calls `setPredicateEvaluator()` to install an evaluator; then it runs against type-valid values.
- **Gotcha**: `s.any` produces the empty schema `{}`; the validator has special-case logic allowing `null`/`undefined` when no `type` is present. `validate` is defined after `create` but attached via closure — refactoring declaration order needs care.

### `src/contract.ts` — agent-surface contracts

`agentContract(schemas)` adapts root-path → schema maps into the contract seam tosijs's agent surface consumes (`check` returns `true | Error`-with-reason on a whole-root proposal; `describe` returns the plain-JSON contract). Strict validation by default — a gate that samples isn't a gate. `checkExamples()` lints `examples` (must pass) and `$counterexamples` (must fail) across the schema tree; predicate-dependent counterexamples with no evaluator registered report `unverifiable`. `validate` guarantees unknown `$`-prefixed and `x-*` keys pass through untouched — that guarantee is documented and test-pinned; don't break it.

### `src/monad.ts` — railway-oriented pipelines

`M.func(InputSchema, OutputSchema, impl, timeoutMs?)` wraps a function with schema-validated I/O and a timeout (default 5000ms); `new M(registry)` builds async fluent chains where a `SchemaError` bypasses subsequent steps. Types are inferred from the schemas.

### Tests

- `src/schema.test.ts`, `src/coverage.test.ts` — validator behavior; `src/any.test.ts` — `s.any`; `src/monad.test.ts` — pipelines; `src/predicate.test.ts` — `$predicate`; `src/contract.test.ts` — `agentContract`, `checkExamples`, `$`-key passthrough.
- `src/inference.types.ts` — compile-time-only type inference tests (tsc, not bun).
- High coverage is a marketed feature (schemas are data flowing through tested code) — keep it that way.

## Releasing

`bun run pack` is the prepublish gate (runs everything, regenerates `examples.md` and `dist/context.md`, builds ESM + CJS + declarations into `dist/`). Before a minor/major bump, run the `pre-release-review` skill (part of the shared practices process). Update `CHANGELOG.md` and `llms.txt` with every release.

**Drift gate:** after the final `bun run pack`, `git status --porcelain` must be empty before tagging — if it isn't, a generated artifact (examples.md, dist/, COVERAGE numbers, llms.txt version) is stale in the commit.

**Publishing and pushing are human-only.** Stop after commit + tag and wait for an explicit go-ahead; never run `npm publish`/`bun publish` or `git push` yourself.
