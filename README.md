# tosijs-schema

[npm](https://www.npmjs.com/package/tosijs-schema) | [github](https://github.com/tonioloewald/tosijs-schema) | [discord](https://discord.gg/ramJ9rgky5) | [examples](./examples.md)

[![npm](https://badge.fury.io/js/tosijs-schema.svg)](https://www.npmjs.com/package/tosijs-schema)
[![size](https://deno.bundlejs.com/?q=tosijs-schema&badge=)](https://bundlejs.com/?q=tosijs-schema&badge=)

A **schema-first** validation library. Define schemas, infer TypeScript types, validate efficiently.

## Versioning & stability

**Validation getting *stricter* is a breaking change**, and we treat it as one — even though semver's letter would call it additive. A validator that starts rejecting data it used to accept fails a consumer's next `npm install` with no change on their side, which is indistinguishable from a break from where they sit. So, for this library:

- **Tightening** (enforcing something previously ignored, closing a hole) is called out as **BREAKING** in the [CHANGELOG](./CHANGELOG.md) with a migration note, and lands in a release the changelog marks as breaking. This project carries breaking changes in **minor** bumps (it is past 1.0 but still fast-moving); the changelog is the source of truth for what broke, not the version letter.
- **Loosening** (accepting more, a new opt-in) and **new API** are ordinary minors.
- We **deprecate before we remove**, and keep a migration table in the CHANGELOG — which ships in the npm tarball, so it's reachable from what you installed.

**Why we break toward correctness rather than hold compatibility:** a schema validator that accepts data the spec rejects — or that leaves a declared constraint unenforced — is wrong in a way that quietly corrupts everything downstream (schemas that don't travel, gates that don't gate). We'd rather refuse that data loudly, in a documented release, than carry the incorrectness forward. The one distinction we hold: a **fail-open** fix (the old behavior was a hole) is never softened with a "legacy-loose" option — that would just be an opt-in to the bug; a **spec-conformance** tightening is the kind we'd consider a flag for if there were ever demand.

Pin an exact version (or use a lockfile) if you cannot absorb a validation change on install. Each breaking release has an "Upgrading" section below and a changelog entry naming exactly what changed.

## Upgrading

### To 1.9.0 (from 1.8.x) — closes a fail-open; `maxProperties` newly enforced

`validate` now enforces **`maxProperties`** in its default (non-strict) path, which it previously *ignored* — a strict-only "ghost constraint" ([#9](https://github.com/tonioloewald/tosijs-schema/issues/9)). This is a validation tightening, so it's breaking:

| Schema | ≤ 1.8.1 (default `validate`) | 1.9.0 |
| --- | --- | --- |
| `{ maxProperties: 1 }` on `{ a: 1, b: 2 }` | pass (ignored) | **fail** (too many props) |

Only affects schemas that declare `maxProperties`. The check short-circuits at `max + 1`, so it's O(min(N, max+1)) — cheap for normal ceilings, and objects without the keyword are untouched. `{ strict: true }` and `agentContract` already enforced it, so anything gated through them is unchanged. **`filter()` shares this enforcement** — it re-validates its stripped result, so filtering an over-ceiling object against a `maxProperties` schema now returns an `Error` where 1.8.x returned the (still-over-ceiling) data (`filter` strips unknown keys, not surplus dictionary entries). If a schema was leaning on the old skip, drop the `maxProperties` keyword or raise the ceiling. Everything else is additive.

### To 1.8.0 (from 1.7.x) — closes a fail-open; two keywords newly enforced

`validate` now enforces **`oneOf`** and **`exclusiveMinimum`/`exclusiveMaximum`**, which it previously *ignored* (returning `true` for values they forbid — [#8](https://github.com/tonioloewald/tosijs-schema/issues/8)). This is a validation tightening, so it's breaking:

| Schema | ≤ 1.7.0 | 1.8.0 |
| --- | --- | --- |
| `{ oneOf: [{type:'string'}] }` on `42` | pass (ignored) | **fail** (matches no branch) |
| `{ exclusiveMinimum: 0 }` on `0` | pass (ignored) | **fail** |
| a value matching **two** `oneOf` branches | pass | **fail** (oneOf = exactly one) |

If you were relying on `oneOf` being a no-op, note it now has real exactly-one-match semantics (a value matching two branches is rejected — prefer `anyOf` for discriminated unions). New in this release: `unenforcedKeywords(schema)` to detect keywords still outside the enforced set, and `setWarnings(false)` to silence the `oneOf` cost warning. Everything else is additive.

### To 1.7.0 (from 1.6.x) — one BREAKING validation change

`format: 'date-time'` now enforces **RFC 3339** instead of `Date.parse`. Strings that aren't valid RFC 3339 date-times now fail — they were accepted before but a conforming validator (Ajv, etc.) always rejected them, so schemas carrying them never travelled.

| Value under `format: 'date-time'` | ≤ 1.6.1 | 1.7.0 | Fix |
| --- | --- | --- | --- |
| `2020-01-01T10:00:00Z` | pass | pass | — |
| `2020-01-01` (date only) | pass | **fail** | use the new `s.date` (`format: 'date'`) |
| `2020-01-01 10:00:00` (space) | pass | **fail** | make it a `T`: `2020-01-01T10:00:00Z` |
| `Jan 1 2020` | pass | **fail** | normalise to RFC 3339, or drop `format` |

Also new: **`format: 'date'`** (RFC 3339 full-date) is now enforced — previously it was an ignored annotation, so a non-date string with `format: 'date'` now fails. And `inferSchema(…, { formats: true })` labels date-only columns `date` (not the invalid `date-time` 1.6.x emitted). Everything else is additive.

### To 1.6.0 (from 1.5.x)

Additive — nothing that validated before is rejected now. New: [`inferSchema`](#infer-a-schema-from-data), open objects (`.open`), and multi-type `type` arrays now validate as unions. Optional-but-recommended: if you `inferSchema`, note its output now carries `$inferred: true` at the root (pass `{ marker: false }` to omit).

### To 1.5.0 (from 1.4.x) — BREAKING

**1.5.0 makes `validate` enforce what your schemas already declared.** Several fail-open validator bugs were fixed, and data that previously slipped through is now refused:

| Before (≤ 1.4.0) | 1.5.0+ | If you relied on the old behavior |
| --- | --- | --- |
| `additionalProperties: false` ignored — extra keys passed | extra keys rejected (incl. `constructor`, `__proto__`) | model open objects with **`.open`** or `s.record(s.any)`; or strip extras with `filter()` first |
| `minItems`/`maxItems` ignored without an `items` schema | enforced | intended, no action |
| `strict` didn't reach into `anyOf` branches | it does | intended, no action |

This shipped as a minor (see policy above), which broke consumers whose schemas were *accidentally* open (they had no way to spell an intentionally-open object until `.open` in 1.6.0 — that gap is why it bit hard). If you can't adopt yet, pin `1.4.0`; note that pinning retains a known validation bypass, so treat it as a short migration window.

## Why Not Zod?

### Schema-First vs TypeScript-First

**Zod's premise**: TypeScript is the source of truth → derive validation → convert to JSON Schema when needed

**Schema-first premise**: The schema IS the source of truth → derive both types AND validation

If your data crosses any boundary—API, LLM, database, another language, documentation—you need a schema. If you need a schema anyway, why isn't that the source of truth?

```
Zod:           TypeScript → Zod → zod-to-json-schema → OpenAPI/LLMs
tosijs-schema: JSON Schema → Types + Validation (single source of truth)
```

**JSON Schema is a universal standard.** The same schema that validates data in your TypeScript app can:
- Generate types for Python, Go, Rust, Java, C# (via codegen tools)
- Define your OpenAPI/Swagger documentation
- Configure LLM structured outputs (OpenAI, Anthropic)
- Be stored in a database and shared across services
- Be understood by any language or tool that speaks JSON Schema

**Schemas are serializable data.** Your types can travel with your data, enabling self-documenting APIs and pipelines. An endpoint can return its own schema. A message queue can include the schema for its payload. A pipeline step can advertise its input/output types. No separate documentation to maintain—the types *are* the documentation.

With Zod or TypeBox, TypeScript is your source of truth—other languages get second-class derived artifacts. With tosijs-schema, JSON Schema is your source of truth and TypeScript is just one of many consumers.

### Cleaner Syntax

```typescript
// tosijs-schema
const User = s.object({
  id: s.integer,
  email: s.email,
  name: s.string.min(1),
  role: s.enum(['admin', 'user']),
})

// Zod
const User = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'user']),
})
```

Formats are first-class citizens (`s.email`) not method chains (`z.string().email()`).

### Lighter Schemas

```typescript
// tosijs-schema: s.email.schema
{ "type": "string", "format": "email" }

// Zod: z.string().email()
ZodString {
  _def: { checks: [...], typeName: 'ZodString', coerce: false },
  spa: [Function], superRefine: [Function], optional: [Function],
  // ... 30+ methods and properties
}
```

| 100 schemas | tosijs-schema | Zod |
|-------------|---------------|-----|
| Memory | ~20KB | ~300-500KB |
| JSON serializable | Yes | No |
| Can send over wire | Yes | No |
| Can store in DB | Yes | No |

### Test Coverage That Actually Covers Your Schemas

tosijs-schema schemas are **data** (JSON). Zod schemas are **code** (class instances).

This matters: our ~97% test coverage covers **every schema you'll ever write** because your schemas are just JSON objects that flow through the same tested validation code.

Zod's test coverage only covers Zod's internals. Your specific Zod schemas—your method chains, your compositions—are untested code. That's on you.

```typescript
// tosijs: this is data, covered by library tests
s.object({ email: s.email, age: s.integer.min(0) })

// Zod: this is code, YOU must test it
z.object({ email: z.string().email(), age: z.number().int().min(0) })
```

### Direct Comparison

| Aspect | tosijs-schema | Zod | TypeBox |
|--------|---------------|-----|---------|
| Philosophy | Schema-first | TypeScript-first | JSON Schema + JIT |
| Output | Native JSON Schema | Proprietary | Native JSON Schema |
| JSON Schema spec | Practical subset | N/A (not JSON Schema) | Draft 2020-12 compliant |
| Syntax | `s.email` | `z.string().email()` | `Type.String({ format: 'email' })` |
| Bundle | ~8kB (or ~1.5kB, `/infer` only) | ~14kB | ~64kB |
| Schema objects | Plain JSON (~200B) | Class instances (~3-5KB) | JSON Schema objects |
| Runtime deps | 0 | 0 | 0 |
| Performance | ~2x faster + O(1) sampling | O(n) | JIT compiled (~27x faster full scan) |
| Runtime schemas | **Yes (direct)** | No | Yes (with preprocessing) |
| Uses `eval` / `new Function()` | No | No | Optional (JIT compiler) |
| Test coverage | ~97% (covers YOUR schemas) | Battle-tested | Battle-tested |
| Ecosystem | Small | Large (tRPC, etc.) | Growing (Fastify, Elysia) |

### Runtime Schema Support

A key architectural difference: **tosijs-schema validates plain JSON schemas directly with zero overhead.**

```typescript
// Receive a schema over the wire, from a database, or from user input
const schemaFromServer = await fetch('/api/schema').then(r => r.json())

// tosijs-schema: works immediately, no preprocessing
validate(data, schemaFromServer) // ✅

// Zod: impossible - schemas must be defined with z.object(), z.string(), etc.

// TypeBox: requires preprocessing to inject Kind symbols, then optional JIT compile
const injected = injectTypeBoxKind(schemaFromServer)  // ~0.2ms overhead
const compiled = TypeCompiler.Compile(injected)        // ~1.0ms overhead
compiled.Check(data)
```

**Runtime schema benchmark (100k items):**
```
tosijs (direct):     0.2ms   ← zero preprocessing
TypeBox (injected):  1.2ms overhead + 2.5ms validation
Zod:                 not possible
```

This matters for:
- **Dynamic systems** where schemas are stored in databases or config
- **Multi-tenant apps** where each tenant defines their own data shapes
- **Schema registries** that serve schemas to multiple services
- **AI/LLM pipelines** where schemas are generated or modified at runtime
- **Plugin systems** where extensions define their own validation rules

### JSON Schema Coverage

tosijs-schema implements a **practical subset** of JSON Schema - the features that cover real-world use cases, not the full specification. This is a deliberate tradeoff: ~8kB bundle (tree-shakeable — see below) vs spec compliance.

**Supported:** `type`, `properties`, `required`, `items`, `enum`, `const`, `anyOf` (unions), `oneOf` (exactly-one), `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `minProperties`, `maxProperties`, `additionalProperties`, `format` (`email`, `uuid`, `uri`, `ipv4`, `date`, `date-time` — RFC 3339, `emoji`), boolean schemas (`true`/`false`), `$predicate` (with a registered evaluator), `default`, `title`, `description`

**Not supported:** `$ref` / `$defs`, `if` / `then` / `else`, `dependentRequired`, `patternProperties`, `unevaluatedProperties`, `allOf`, `not`, `uniqueItems`, `contains`, `prefixItems`, `propertyNames`, and other advanced keywords.

**Stepping outside the subset is detectable — that's the point.** `validate` silently ignores unsupported keywords (they pass through untouched, like any unknown key), which means a schema using `allOf` or `not` gets a `true` that didn't actually check them. So the enforced set is exported (`ENFORCED_KEYWORDS`), `agentContract` **refuses** a schema outside it at construction (a gate must not fail open), and `unenforcedKeywords(schema)` returns the tree-paths a schema uses that `validate` won't enforce — so a consumer can *warn* ("this schema uses `allOf`, which isn't validated") rather than imply a check that never happened. A documented subset is fine; a subset you can't tell you've left is not.

```typescript
import { unenforcedKeywords } from 'tosijs-schema'

unenforcedKeywords({ type: 'object', allOf: [{ type: 'object' }] })
// ['root.allOf']   — validate() ignores it; render a warning next to the field
unenforcedKeywords({ oneOf: [{ type: 'string' }] })
// []               — oneOf IS enforced
```

> **`oneOf` is enforced but expensive.** Unlike `anyOf` (which stops at the first matching branch), `oneOf` must try *every* branch to confirm exactly one matches. It emits a console warning (once per process — the nudge is generic, so it doesn't re-fire per node or per request even when schemas are parsed fresh over the wire) nudging you toward `anyOf` for discriminated unions; silence it with `setWarnings(false)` — note that toggle is process-global (and re-enabling re-arms the one-time warning).

If you need full JSON Schema Draft 2020-12 compliance and `eval` is acceptable in your environment, TypeBox or Ajv are options. If you need the 80% of features that cover 99% of real-world schemas in a tiny, eval-free package, use tosijs-schema.

**A note on `eval` and security:** JSON Schema exists to define safe data contracts for interchange between untrusted parties. Ajv uses `new Function()` to generate validators - executing dynamically constructed code strings. TypeBox's JIT compiler (`TypeCompiler`) also uses `new Function()`, but offers an interpreted mode (`Value.Check()`) that works without eval - albeit ~18x slower than JIT. Ajv offers build-time pre-compilation as a workaround for static schemas. For sandboxed environments, edge functions, or anywhere CSP restricts `unsafe-eval`, tosijs-schema and TypeBox's interpreted mode both work without code generation.

### When to Use Zod

- You need tRPC, react-hook-form, or other Zod ecosystem integrations
- You want transforms/refinements in your schema layer
- Ecosystem momentum matters more than architecture

### When to Use TypeBox

- You need full JSON Schema Draft 2020-12 compliance
- You have a fixed set of schemas known at startup (compile once, validate millions)
- You need maximum validation throughput (high-traffic APIs, real-time pipelines)
- You're building with Fastify or Elysia (native TypeBox support)
- Bundle size isn't a primary concern (~64kB vs ~6kB)
- Note: JIT mode uses `new Function()`, but interpreted mode (`Value.Check()`) works in CSP environments at ~18x slower

### When to Use tosijs-schema

- You need to validate against **dynamic/runtime schemas** (from DB, API, user input)
- You need a **sandboxed environment** where `eval` / `new Function()` is not allowed
- You need JSON Schema output (OpenAPI, LLMs, code generators)
- Bundle size matters (edge functions, serverless cold starts)
- Supply chain security matters (zero dependencies)
- Schemas are data that flows through your system, not static configurations
- Sampling-based validation is acceptable (statistical confidence for large datasets)

## Installation

```bash
npm install tosijs-schema
```

## Quick Start

```typescript
import { s, validate, type Infer } from 'tosijs-schema'

// Define schema
const User = s.object({
  id: s.integer,
  email: s.email,
  role: s.enum(['admin', 'user']),
  tags: s.array(s.string).optional,
})

// Infer TypeScript type
type User = Infer<typeof User>

// Validate
validate(data, User) // returns boolean

// Get the JSON Schema
console.log(User.schema)
// { type: 'object', properties: { ... }, required: [...], additionalProperties: false }
```

## API

### Primitives

```typescript
s.string          s.number          s.integer         s.boolean
s.null            s.undefined       s.any
```

### Formats (First-Class)

```typescript
s.email           s.uuid            s.url             s.ipv4
s.date            s.datetime        s.emoji           s.pattern(/.../)
```

`s.date` (RFC 3339 full-date) and `s.datetime` (RFC 3339 date-time) validate against the same predicates a conforming validator (Ajv) uses, so the schemas travel.

### Complex Types

```typescript
s.object({ key: s.string })     // Object with specific properties (strict — no extra keys)
s.object({ key: s.string }).open // …plus unknown keys (additionalProperties: true)
s.array(s.number)               // Array of numbers
s.record(s.string)              // Record<string, string>
s.tuple([s.string, s.number])   // Fixed-length tuple
s.enum(['a', 'b', 'c'])         // String enum
s.union([s.string, s.number])   // Union type
s.const('literal')              // Literal value
```

`.open` (or `s.object(props, { additionalProperties: true })`) keeps the declared `properties` and `required` but admits unknown keys — reach for it when the shape belongs to a protocol you don't control (e.g. an LLM chat message a provider keeps adding fields to). A runtime schema should reject what's *wrong*, not what's merely *newer than you are*.

### Constraints

```typescript
s.string.min(1).max(100)        // String length
s.number.min(0).max(100)        // Numeric range
s.number.step(0.5)              // Multiple of
s.array(s.string).min(1).max(10) // Array length
s.record(s.number).min(1)       // Min properties
s.string.optional               // Nullable
```

### Metadata

```typescript
s.string
  .title('Username')
  .describe('Unique identifier')
  .default('anonymous')
  .meta({ examples: ['alice', 'bob'] })
```

## Validation

### Default (Fast)

```typescript
validate(data, schema) // boolean
```

Uses stride sampling for large arrays/objects (O(1) for >97 items).

### Strict (Full)

```typescript
validate(data, schema, { strict: true })
```

Validates every item (no stride sampling). `maxProperties` is enforced in every mode as of v1.9.0, so `strict` no longer changes it.

### Error Handling

```typescript
validate(data, schema, (path, msg) => {
  console.error(`${path}: ${msg}`)
})

// Or with options
validate(data, schema, {
  strict: true,
  onError: (path, msg) => console.error(path, msg)
})
```

## Filter

Strip extra properties from data:

```typescript
import { filter } from 'tosijs-schema'

const clean = filter(dirtyData, schema)
// Returns filtered data or Error if validation fails

const clean = filter(dirtyData, schema, { skipValidation: true })
// Skip validation, just filter
```

## Diff

Detect schema changes:

```typescript
import { diff } from 'tosijs-schema'

diff(schemaV1.schema, schemaV2.schema)
// { field: { error: 'Type mismatch: string vs number' } }
// or null if identical
```

## Infer a schema from data

`inferSchema(sample, opts?)` goes the other direction from `Infer<S>` — **data → schema, at runtime**. Point it at a pile of JSON and get a starting schema to refine.

```typescript
import { inferSchema } from 'tosijs-schema'
// tree-shakers can import the ~1.5kB module directly:
// import { inferSchema } from 'tosijs-schema/infer'

inferSchema([{ id: 1, tag: 'a' }, { id: 2 }])
// { type: 'array', items: {
//     type: 'object',
//     properties: { id: { type: 'integer' }, tag: { type: 'string' } },
//     required: ['id'],              // tag absent from row 2 → optional
//     additionalProperties: true } } // OPEN — describes a sample, not a contract
```

Design choices that keep it honest:

- **Unifies across *every* element**, never just `sample[0]` — a key missing from the first row keeps its column. Presence decides `required` (in every element → required; in some → optional). `null` contributes `'null'` to the type union rather than being treated as absent.
- **Structure only.** It never infers `minimum`/`maxLength`/etc. from a sample's observed range — those extremes are not the domain's, and baking them in would reject valid future data.
- **Objects are open** (`additionalProperties: true`): an inferred schema describes a sample, not a contract. Closing it would make `filter(data, schema)` silently strip any field that happened not to appear.
- **Off by default, opt-in when you want them:** `{ formats: true }` sniffs `date-time`/`date`/`email`/`uri`, but only when *every* value matches; `{ enums: true }` proposes `enum` only for genuinely low-cardinality fields (so a 3-row fixture doesn't turn an id column into an enum of three ids); `{ sampleSize, onTruncate }` caps sampling and tells you when it truncated.
- **Deterministic** (stable key order — these schemas get committed and diffed) and **total** on empty/degenerate input (`[]`, `[null, null]`, `undefined` → a minimal schema, never a throw).
- **Marked as observed, not authored.** The root carries `$inferred: true` so a reader (an agent, a form editor, a gate reading `describe()`) can tell "a sample looked like this" from "someone promised this" — the same `{ type: 'integer' }` otherwise. It's a pure annotation (`validate` ignores it, `agentContract` allows it through). Pass `{ marker: false }` for a clean schema to hand-edit; promoting an inferred schema to a declaration means dropping the marker.

Guarantee: `validate(sample, inferSchema(sample))` is always `true` — an inferred schema accepts its own sample.

> The builder also has a legacy `s.infer(value)` — it samples only the first array element and closes objects. Prefer `inferSchema`, which is the corrected, spec-followed version.

## Tree-shaking & bundle size

Import only what you use. The package is `sideEffects: false` and each concern is a separate module, so a modern bundler drops the rest. Measured, minified + gzipped:

| You import | Pulls in | gzipped |
| --- | --- | --- |
| `inferSchema` (from `tosijs-schema/infer`) | just inference | **~1.5 kB** |
| `validate` | the validator | ~2.7 kB |
| `s` (builder) | builder + validator | ~2.7 kB |
| `filter` | validator + filter | ~3.1 kB |
| `agentContract` | validator + contract layer | ~4.6 kB |
| everything | the whole library | ~7.9 kB |

`inferSchema` is also published as a self-contained subpath, `tosijs-schema/infer`, so it stays ~1.5 kB even where a bundler can't tree-shake the pre-bundled main entry. The other pieces share the validator core (one module), so importing `validate`, `s`, `filter`, or `diff` lands around 2.7–3.1 kB regardless.

## Agent Contracts

`agentContract(schemas)` adapts a map of root path → schema into the contract seam consumed by capability-gated write paths (e.g. [tosijs](https://github.com/tonioloewald/tosijs)'s agent surface): `check()` judges a proposed whole-root value and returns `true` or an `Error` carrying the refusal reason; `describe()` returns the serializable per-root contract.

```typescript
import { agentContract } from 'tosijs-schema'

const contract = agentContract({
  'app.order': s.object({ item: s.string, qty: s.number }),
})

contract.check('app.order.qty', 'x', {
  root: 'app.order',
  proposed: { item: 'yuzu', qty: 'x' },
})
// Error: contract violation at app.order.qty — qty: Expected number

contract.describe() // plain JSON Schemas — "what's legal", shippable over the wire
```

Deep writes are judged as the whole root they would produce, so `required` on siblings, cross-field constraints, and root-level `$predicate`s all participate. Validation is strict by default (a gate that samples isn't a gate); pass `{ strict: false }` to opt into sampled validation for huge roots.

**The gate fails closed.** Schemas are deep-copied at construction and again out of `describe()`, so mutating either the original schema object or `describe()`'s return value cannot change what `check()` enforces. Construction validates every schema key against an **allowlist** — the `ENFORCED_KEYWORDS` set `validate` actually implements, plus annotations (`title`, `description`, `default`, `examples`, `$counterexamples`, …) and `x-*` extensions. Anything else — `allOf`/`not`/`$ref`, unimplemented spec keywords, even typos like `minumum` — is refused with an `Error`: a constraint that ships in `describe()` as "what's legal" but is never enforced would be a silent hole; express such constraints via `$predicate` instead. Value-level holes are refused too: `format` outside `ENFORCED_FORMATS`, invalid `pattern` regexes, tuple `items` without an exact `maxItems` cap, non-primitive `const`/`enum` members, and multi-type arrays. Boolean schemas are legal and enforced (`properties: { key: false }` forbids the key). Protocol breaches fail closed as well: any write touching a contracted root — at it, under it, or above it — without a proposal for that exact root, a mismatched `proposal.root`, and ancestor writes spanning several contracted roots are all refused with an `Error` naming the breach.

### Examples as tests

Two conventions make a contract self-proving:

- **`examples`** (standard keyword) — values the schema must accept
- **`$counterexamples`** (our convention) — values it must refuse; a gate that never says no isn't a gate

`checkExamples(schema)` lints the whole schema tree at definition time: every example must pass its own node, every counterexample must fail. It returns findings (empty = the spec doesn't lie); a counterexample that passes structurally but sits under a `$predicate` with no evaluator registered is reported as `unverifiable` rather than `accepted`.

Note: the `$predicate` *source format* is defined by whatever evaluator you register via `setPredicateEvaluator()` — this library treats the string as opaque. A canonical format specification is pending in tjs-lang (see `UPSTREAM.md`).

**Extension-key guarantee:** `validate` ignores — and never mutates — unrecognized `$`-prefixed keys (and `x-*` keys), so conventions like `$counterexamples` and future `$exercise` metadata are safe to standardize on and travel with the schema.

## Monadic Pipelines

Type-safe function chains with schema validation:

```typescript
import { M, createM } from 'tosijs-schema'

const greet = M.func(
  s.object({ name: s.string }),
  s.object({ greeting: s.string }),
  (input) => ({ greeting: `Hello, ${input.name}` })
)

const pipeline = createM({ greet, ... })

const result = await pipeline
  .greet({ name: 'World' })
  .anotherStep()
  .result()
```

## LLM / OpenAI Integration

Works directly with OpenAI Structured Outputs:

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'extraction',
      strict: true,
      schema: MySchema.schema, // Direct - no conversion needed
    },
  },
})
```

No `zod-to-json-schema`. No conversion artifacts. Fewer tokens.

## Performance

```
[Array 1M items]                        Hot JIT
  tosijs (sampling):   0.3ms            (1273x vs Zod, 23x vs TypeBox JIT)
  tosijs (strict):     188ms            (2x vs Zod)
  TypeBox (JIT):       6.8ms            (57x vs Zod)
  TypeBox (interp):    122ms            (3x vs Zod)
  Zod:                 392ms

[Dict 100k keys]                        Hot JIT
  tosijs (sampling):   2.0ms            (29x vs Zod, 3x vs TypeBox JIT)
  tosijs (strict):     22ms             (2.6x vs Zod)
  TypeBox (JIT):       5.6ms            (10x vs Zod)
  TypeBox (interp):    17ms             (3.5x vs Zod)
  Zod:                 58ms
```

**Key insight:** TypeBox's JIT compilation produces the fastest full-scan validation. tosijs-schema's stride sampling trades exhaustive checking for O(1) performance on large datasets. Choose based on your requirements: maximum throughput with full coverage (TypeBox) vs minimal overhead with statistical sampling (tosijs).

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Stride sampling (97) | Prime number, checks ~1% of large collections, always verifies first/last |
| `maxProperties` enforced in every mode (v1.9.0) | The check short-circuits at `max+1`, so it's O(min(N, max+1)) — only schemas that declare it pay, bounded by the declared ceiling |
| `additionalProperties: false` enforced (since v1.5.0) | Unknown keys are refused; previously a falsy-check bug skipped this — use `filter()` for lenient intake that strips extras instead |

## Test Coverage

<!-- coverage:readme (generated by make-coverage.ts — do not hand-edit) -->
```
File             | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|---------|-------------------
All files        |   98.94 |   98.60 |
 src/contract.ts |   97.73 |   97.39 | 85,469,471,474,483-485,516-517
 src/formats.ts  |  100.00 |  100.00 |
 src/infer.ts    |  100.00 |  100.00 |
 src/monad.ts    |  100.00 |  100.00 |
 src/schema.ts   |   96.97 |   95.60 | 122-126,336-342,477,1058-1059,1073,1093-1094,1117-1126,1129-1130
```

281 tests, 900 assertions.
<!-- /coverage:readme -->

## License

MIT
