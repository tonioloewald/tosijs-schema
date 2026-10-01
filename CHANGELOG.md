# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.13.0] — 2026-10-02

**Contains one narrow BREAKING change** (to `filter`, on invalid input only).
See README "Upgrading to 1.13.0". Everything else is a fix or a loosening.

### Changed — BREAKING (narrow)

- **With both `anyOf` and `oneOf`, `filter` no longer drops a key the `oneOf`
  branch declares to force invalid data through.** It returns an `Error`
  instead, as a `oneOf`-only schema already did.
  - Example: `anyOf: [{ properties: { a: { type: 'number' }, c: { type: 'number' } } }, { properties: { a: {}, b: {} } }]`
    with `oneOf: [{ properties: { c: { type: 'string' } } }]` and the data
    `{ a: { a: 1 }, b: 1, c: 1 }`. Before: `{ a: { a: 1 }, b: 1 }`, with `c`
    silently gone. After: `Error`.
  - Only inputs that fail `validate` are affected. A fuzz pass over ~78k
    schemas found no valid input that newly errors. Where both versions return
    data, 1.13.0's output keeps a superset of the keys.
  - **Migration:** pass data that validates, or handle the `Error`. Either way
    you were relying on a key being discarded without notice.

### Fixed

- **Types now resolve under `moduleResolution: "nodenext"` / `"node16"`.** The
  published declarations used extensionless relative imports
  (`export * from './src/schema'`), which Node's ESM resolution refuses in a
  `"type": "module"` package, so a TypeScript Node project got no types at all
  (`Module "tosijs-schema" has no exported member 's'`). `bundler` resolution
  hid it, because it adds extensions for you. Shipped source now writes `.js`
  extensions, and the release smoke test typechecks a consumer under `nodenext`
  as well as `bundler`. Verified on TypeScript 5.9.2 and 7.0.2, and for a
  CommonJS consumer under `nodenext`. Present in every release until now.

- **`filter` honours the sibling keywords of `anyOf` / `oneOf`.** A union
  beside `properties` / `additionalProperties` returned straight from the
  union arm, so `filter` refused (`Unexpected junk`) data whose stripped form
  `validate` accepts, and an open outer schema could lose a key the branch
  didn't declare. Each branch is now stripped against itself merged with its
  siblings. A key survives if either one declares it and neither forbids it,
  recursively through shared `properties` and `items`. The result must
  validate against both. Where the sibling and the branch BOTH carry their own
  `anyOf`/`oneOf`, no single strip schema can represent both, so that node is
  left unstripped and validation decides. The worst case is a loud `Error`,
  never a silently dropped key. With both `anyOf` and `oneOf` present, `anyOf`
  acts as a sibling of each `oneOf` branch.
- **`checkExamples` no longer reports `unverifiable` for a `$predicate` that
  `validate` never runs.** A predicate inside `not`, `allOf` or an unreferenced
  `$defs` made counterexamples report `unverifiable` when they are `accepted`
  whatever an evaluator says. Predicate reachability now follows only the
  subtrees `validate` executes. The examples lint still visits every node, and
  every branch of its walk is now tested. The order of `checkExamples` findings
  changed and is documented as not part of the contract. Key on `schemaPath`
  and `index`.

## [1.12.0] — 2026-09-26

**Contains BREAKING validation changes.** See README "Upgrading to 1.12.0".

### Fixed — BREAKING

- **A stray `schema` key no longer turns a schema into accept-all** (board
  #1390). `validate`'s second argument was unwrapped with `x?.schema ?? x`, so
  `validate(42, { type:'object', required:['a'], schema:true })` returned
  `true`. Two 1.11.0 attempts to tell a wrapper from a stray key by keyword
  shape each made some legitimate wrapper accept-all instead — the two shapes
  are indistinguishable by inspection. So: builders now carry a brand
  (`Symbol.for('tosijs-schema.builder')`, exported as `BUILDER`, tested by
  `isBuilder`), which JSON cannot carry; a NON-builder with a `schema` key is
  refused as ambiguous on every path (`validate` → `false` + reason, `filter` →
  `Error`, `M.func` → throws at construction).
  - **Migration:** a wrapper such as the OpenAI `{ name, strict, schema }`
    envelope used to unwrap; pass `envelope.schema` instead. A stray key
    (usually a `$schema` typo): delete it.
  - The refusal applies only to the argument a caller passes. Inside a
    schema tree a `schema` key stays an ignored unknown keyword at every depth
    (union branches included), and a builder whose schema carries one (e.g.
    via `.meta()`) still works everywhere.
  - **`unwrap` (public since 1.11.0) changed contract:** for the ambiguous
    shape it now returns an opaque internal sentinel instead of a schema. If
    you call it, guard with `isBuilder(x)` first or pass the schema itself.
  - **Which entry points refuse:** `validate`, `filter` and `M.func`.
    `agentContract` already refused the shape at construction (its keyword
    allowlist). `checkExamples` is a lint over a schema tree and treats a root
    `schema` key as an ignored unknown keyword, as in 1.11.0. Run
    `unenforcedKeywords()` to see it.
- **Builder combinators refuse a plain schema** (board #1391).
  `s.array({ type: 'string' })` read `.schema` off a plain object, got
  `undefined`, and silently built `{ type: 'array' }` — no `items`, so every
  element passed. `s.object({ a: { type: 'string' } })` threw a raw internal
  `TypeError`. `s.array`, `s.object`, `s.record`, `s.tuple` and `s.union` now
  throw a `TypeError` naming the argument (property / index). TypeScript
  callers were already protected by `Base<T>`; this reaches JS callers,
  `as any` and deserialized config.
  - **Migration:** pass a builder (`s.string`, not `{ type: 'string' }`), or
    drop the builder entirely and validate against the plain schema.

### Added

- `BUILDER` (the `Symbol.for('tosijs-schema.builder')` brand) and
  `isBuilder(x)`. Internal helpers (`validateResolved`, `AMBIGUOUS`,
  `AMBIGUOUS_MESSAGE`) are marked `@internal` and stripped from the
  published types.

### Size

The brand, the refusal paths and the five combinator guards cost about
+0.3 kB gzipped on `validate`/`s` and +0.4 kB for the whole library
(8.4 → 8.8 kB) — see README "Tree-shaking & bundle size".

## [1.11.0] — 2026-09-26

**Contains BREAKING validation changes** — the deliberate sweep of the remaining
fail-open class. Same defect family as [GHSA-3qw7-pvr3-2gpq](https://github.com/tonioloewald/tosijs-schema/security/advisories/GHSA-3qw7-pvr3-2gpq),
narrowed across 1.5.0 / 1.8.0 / 1.9.0 / 1.10.0 — and closed here rather than
one member per release. See README "Upgrading to 1.11.0".

### Fixed — security

- **`format: 'email'` is no longer quadratic.** `/^\S+@\S+\.\S+$/` let `\S`
  match both `@` and `.`, so a non-matching value made the two runs enumerate
  every split point: **5.6s for a 120KB value, ~76s at 480KB** — now **0.1ms**.
  It needed no control over the schema, only over the value of an ordinary
  declared email field, and was reachable through `validate`,
  `agentContract.check`, `M.func` (whose timeout cannot preempt a synchronous
  regex) and the `/infer` subpath. `s.email` emits no `maxLength`, so the length
  guard never fired. The replacement is a linear scan and **accept-set
  identical** — differential-tested over all 2,441,406 strings of length ≤ 9
  from `{a, @, ., space, tab}`: zero mismatches — so no schema changes meaning.
  Present since 1.6.0.

### Fixed — BREAKING

Every item is the same shape: **the check returned `true` having not looked.**

| Case | ≤ 1.10.2 | 1.11.0 |
| --- | --- | --- |
| a **non-enumerable** own property vs `additionalProperties: false` | passes, as though absent | **fails** (`Unexpected <key>`) |
| a non-enumerable property under `additionalProperties: <schema>` | never validated at all | **validated** like any other key |
| a non-enumerable property vs `min`/`maxProperties` | uncounted | **counted** |

- **Non-enumerable own properties are no longer invisible.** Every walk over a
  data object used `for..in` + `hasOwnProperty`, which sees only *enumerable*
  own properties — so such a key escaped the `additionalProperties: false`
  sweep, was never type-checked under an `additionalProperties` schema, and went
  uncounted by the property-count constraints. `JSON.parse` never produces one,
  so the reachable case is a **live JS object** — which is exactly what
  `agentContract` judges (`proposal.proposed`), and why the gate was the real
  exposure.
  - **Migration:** if a value now fails with `Unexpected <key>`, it carries a
    non-enumerable own property that was never being checked. Strip it (
    `filter()` already drops them), declare it, or use `.open`.
  - **`maxProperties` no longer short-circuits at `max + 1`.** 1.9.0 could stop
    counting early; a correct count has to include keys `for..in` skips, and only
    a materializing call reports those. So a huge object with a small declared
    ceiling now enumerates once instead of stopping early — O(N) where it was
    O(min(N, max+1)). Only schemas that DECLARE a count keyword pay it.
  - **Otherwise it is faster.** `Object.getOwnPropertyNames` + an indexed loop beats
    `for..in` + a `hasOwnProperty` call per key: measured 10–20% quicker through
    the real validator (344ms vs 429ms for 20k validations of a 1000-key object).
    Prototype-chain keys remain ignored, as before.
- **Deliberately NOT changed: the builder unwrap.** 1.11.0 twice attempted to
  stop a stray `schema` key from overriding a schema, and each attempt turned a
  legitimate `{ …, schema: X }` envelope — including the OpenAI `json_schema`
  envelope this README documents — into a silent accept-all. Both were caught
  pre-release; the unwrap now ships **exactly as in 1.10.2**. The stray-key
  limitation is therefore unchanged and is tracked for its own release.
  `agentContract` already refuses such a schema at construction, so gates are
  unaffected.

## [1.10.2] — 2026-09-14

Housekeeping patch — no runtime behavior changes. Everything here is docs,
build tooling, or type-level tests; `validate`, `filter`, `agentContract` and
`inferSchema` behave exactly as in 1.10.1.

### Fixed

- **The per-import size table in the README was wrong on every row**, understating
  by 15–20% (`validate` ~2.7 → **3.5 kB**, `s` ~2.7 → **3.5**, `filter` ~3.1 →
  **4.0**, `agentContract` ~4.6 → **5.5**). Tree-shakeability is a headline
  feature, so these are now **measured at build time** by `make-coverage.ts` —
  each entry point is bundled from `dist/index.js` through a one-line re-export
  shim and gzipped — and therefore covered by the existing drift gate. They had
  been hand-maintained and stale across five releases, while the one *generated*
  row ("everything") stayed correct, which made the stale rows look freshly
  verified.

### Changed (internal)

- The prepublish smoke lane parses `npm pack`'s **stdout only** and packs
  straight into its scratch directory (`--pack-destination`). It previously read
  stdout+stderr concatenated and took the last line, so any npm notice
  (deprecation, `EBADENGINE`, a proxy warning) would have become the "filename"
  and failed the release gate with an opaque `ENOENT` — a gate crying wolf is a
  gate that gets muted.
- `affectedRoots()` is documented as returning a fresh, caller-mutable array
  (verified: tampering with it cannot affect the gate), and `describe()` now
  documents *why* it does not carry the gate's `unknownPath` posture — it is
  keyed by caller-supplied root names, so a posture key could collide with a
  real root. Both were open "decide this" items; they are decided and recorded
  rather than left to resurface.
- Type-level tests now pin the `JSONSchema` extension-key index signatures:
  `$`-prefixed and `x-*` keys are assignable, and a typo'd `minumum` is pinned
  with `@ts-expect-error` so the allowlist holds at the type level too.

## [1.10.1] — 2026-09-12

Additive — nothing that validated, gated or compiled before behaves differently.

### Fixed

- **A library that re-exports a schema can emit declarations again**
  ([#11](https://github.com/tonioloewald/tosijs-schema/issues/11)). The builder
  interfaces `s.*` actually return — `Obj`, `Str`, `Num`, `Arr`, plus the
  `SmartObject`/`OptionalKeys`/`RequiredKeys` helpers that appear inside them —
  were declared but never exported, so `export const S = s.object({...})` in a
  published package failed declaration emit with **TS4023** (*"has or is using
  name 'Obj' … but cannot be named"*). Applications never saw it, because they
  never run `tsc --declaration`; it made the package unusable as a dependency of
  any library with schemas in its public API — which for a schema-first library
  is most of them.
  - The report named `s.object`; `s.string.min(1)`, `s.number`, `s.array()` and
    `s.record()` were equally broken, so all of them are fixed, not just the one
    reported.
  - **Why nothing caught it:** `tsc --noEmit` passes, bundlers don't read
    `.d.ts`, and `bun test` doesn't either — declaration emit is the one build an
    application never runs and a library always does. The prepublish smoke lane
    now builds a scratch consumer that **re-exports every builder shape and emits
    its own `.d.ts`**, so this class fails at `bun run pack` instead of at a
    consumer's release. (Same family as tosijs#38 and the `TS2742` case
    `tosijs-3d-ensemble` reported in tosijs-coding-practices#10.)

## [1.10.0] — 2026-09-11

**Contains two BREAKING changes**, both at the `agentContract` construction
boundary and both closing a fail-open: a gate that used to build now throws. `validate`, `filter` and `inferSchema` are **unchanged in
this release** — but see the note under *Known limitation* below: the same
duck-type defect fixed here for the gate is still present in `validate`/`filter`
and is being fixed separately.

Primarily this delivers [#10](https://github.com/tonioloewald/tosijs-schema/issues/10),
reported by a consumer building a capability-gated write path: `check()` answered
a bare `true` both for "this write is valid" and for "this path touches nothing I
contract", so the natural `if (verdict !== true) refuse()` performed **no
validation at all** over uncontracted roots.

### Added

- **`contract.affectedRoots(path): string[]`** — the contracted roots a write
  touches (at, under, or ABOVE it). The matcher `check()` itself uses, so the two
  cannot disagree. It was private, and the obvious hand-rolled version
  (`path === root || path.startsWith(root + '.')`) is wrong: it misses bracket
  indexing (`billing_rules[0].resource`), a bug invisible to any test suite
  written in dotted form. Throws `TypeError` on a non-string path rather than
  answering `[]`, which would fail open in the documented
  `affectedRoots(p).length === 0` posture.
- **`agentContract(schemas, { unknownPath: 'allow' | 'refuse' })`** — makes the
  fail-closed posture expressible. Defaults to `'allow'` (existing behavior,
  correct for a surface that deliberately contracts a subset); `'refuse'` treats
  a write touching no contracted root as a breach. An unrecognized value —
  including `null` from a parsed-JSON config — **throws at construction** rather
  than falling back to the permissive default.
- **`check()` honors its documented `true | Error` seam for a non-string `path`**,
  where it previously threw a raw `TypeError` out of the matcher. Fails closed
  regardless of `unknownPath`.

### Fixed — BREAKING

| Constructor call | ≤ 1.9.0 | 1.10.0 |
| --- | --- | --- |
| schema carrying a stray `schema` key | builds an **accept-all** gate | **throws** |
| `{ strict: 0 }` / `{ strict: '' }` / any non-boolean | builds a **sampling** gate | **throws** |

- **A stray `schema` key can no longer turn a restrictive gate schema into an
  accept-all gate.** The builder unwrap was duck-typed and ran *before* the
  construction allowlist, so `{ type:'object', additionalProperties:false, schema:true }`
  was silently replaced by that key's value — the boolean schema `true`. Reachable
  from the marketed path (schemas received over the wire), and `schema` is not a
  JSON Schema keyword, so nothing else flagged it. Unwrapping now requires an
  actual builder (one carrying `validate`).
  - **Migration:** if `agentContract` now throws naming `root.schema`, that key
    was never being enforced — remove it.
- **`strict` is validated at construction.** `?? true` rescued only nullish, so
  `{ strict: 0 }`, `{ strict: '' }` or `{ strict: NaN }` silently built a
  *sampling* gate — and `{ strict: process.env.STRICT_GATE }` sampled whenever
  the variable was unset, while going strict for the string `'false'`. A
  non-boolean now throws.
  - **Migration:** pass a real boolean. If you were passing a config value, note
    that the old behavior was sampling — i.e. your gate was not strict.

### Known limitation (documented, not newly introduced)

`agentContract`'s root matcher is a **prefix test, not a path parser**. A path matches a root when it equals the root or continues it with `.` or `[`, so **any spelling of the subtree under a root matches** (`app.x`, `app[0].x`, `app["x"]`, `app.0.x` all match root `app`). The gap is in the **root's own spelling**: a multi-segment root (`app.billing`) is recognized only when the path spells those segments identically, so `app["billing"].rate` reads as *uncontracted*. A leading bracket (`["app"].x`) and a JSON Pointer (`/app/billing/rate`) also read as uncontracted. This has been true of every released version; `{ unknownPath: 'refuse' }` (new here) closes it regardless of spelling, and the boundary is now pinned by tests rather than implied.

A canonicalizing matcher was built for this release and **reverted before
shipping**: four review passes each found a further bypass (quoted → leading →
unquoted/numeric → dotted-key and element-scoped), string folding merged
genuinely distinct locations (`a["b.c"]` is ONE key, not two levels), and the
regex was quadratic on unbalanced brackets — an unbounded-CPU path on the
least-trusted input in the system. The correct fix is a tokenizer over segment
arrays plus a written-down grammar, which is its own change rather than a patch
on this one.

The same duck-type unwrap fixed above for the gate is **still present in
`validate`/`filter`** (`schema.ts`), where a stray `schema` key likewise
overrides the schema. That is a tightening of the core validator and ships in
its own release.

> **Type-level note for implementers.** The `AgentContract` interface gained a
> **required** member. If you *implement or wrap* it (a test double, a decorator)
> rather than just consuming what `agentContract()` returns, TypeScript will now
> ask for `affectedRoots`. Forward it —
> `affectedRoots(p) { return inner.affectedRoots(p) }` — and **don't stub it as
> `() => []`**: that re-creates the #10 fail-open inside your double, where it is
> even harder to see.

## [1.9.0] — 2026-09-01

**Contains a BREAKING validation change** (`maxProperties` now enforced in every
mode, closing a fail-open). Same defect class as [GHSA-3qw7-pvr3-2gpq](https://github.com/tonioloewald/tosijs-schema/security/advisories/GHSA-3qw7-pvr3-2gpq)
(fail-open validation), narrowed across 1.5.0 / 1.8.0, narrowed again here. See
README "Upgrading to 1.9.0".

### Fixed — BREAKING

- **`maxProperties` is now enforced in every mode** ([#9](https://github.com/tonioloewald/tosijs-schema/issues/9)).
  Through 1.8.x it was a strict-only "ghost constraint": `validate(obj, schema)`
  in the default (non-strict) path silently ignored it, so
  `validate({ a: 1, b: 2 }, { maxProperties: 1 })` returned `true`. It's now
  checked in the default path too. The check **short-circuits at `max + 1`** — it
  stops the moment it sees one key too many — so the cost is O(min(N, max+1)),
  not O(N), and only schemas that *declare* `maxProperties` pay anything.
  Property-count enforcement is independent of value stride-sampling (a large
  dictionary under its ceiling still samples values by stride). This is a
  validation tightening, so it's breaking even though it lands in a minor (see
  README "Versioning & stability"). `agentContract` and `{ strict: true }`
  already enforced it — this closes the gap in the lenient `validate` path, the
  same internal contradiction #8 fixed for `oneOf`/`exclusive*`.

## [1.8.1] — 2026-08-25

### Fixed

- **`filter()` over `oneOf` now resolves branches that differ only in NESTED
  structure.** The retention score that picks the least-lossy strip counted only
  top-level keys, so `filter({ a: { x: 1, y: 2, z: 3 } }, { oneOf: [{a:{x}},
  {a:{x,y}}] })` returned an `Error` (both strips tied at one top-level key) even
  though `{ a: { x: 1, y: 2 } }` uniquely loses only the junk `z`. The score is
  now a recursive node count, so the less-lossy strip wins — matching how the
  identical shape one level up already behaved. A loosening (it accepts input it
  previously refused; genuinely ambiguous ties still return an `Error`), so
  non-breaking.

## [1.8.0] — 2026-08-23

**Contains a BREAKING validation change** (`oneOf` + `exclusive*` now enforced,
closing a fail-open). Same defect class as [GHSA-3qw7-pvr3-2gpq](https://github.com/tonioloewald/tosijs-schema/security/advisories/GHSA-3qw7-pvr3-2gpq)
(fail-open validation), narrowed by 1.5.0, further narrowed here. See README
"Upgrading to 1.8.0".

This **unblocks schema-driven forms** ([#8](https://github.com/tonioloewald/tosijs-schema/issues/8),
filed from tosijs-ui's `<tosi-schema-form>`): `oneOf` is how discriminated
unions are written in practice, and per-field validation of them was silently
a no-op until now.

### Fixed — BREAKING

- **`oneOf` is now enforced** ([#8](https://github.com/tonioloewald/tosijs-schema/issues/8)).
  `validate` ignored it entirely, so `validate(42, { oneOf: [{ type: 'string' }] })`
  returned `true`. It now requires **exactly one** branch to match (a value
  matching zero *or more than one* fails). `oneOf` can't short-circuit like
  `anyOf`, so it emits a **once-per-process** `console.warn` nudging toward
  `anyOf` for discriminated unions (generic nudge — not re-fired per node or per
  wire-parsed request); silence with `setWarnings(false)`.
  - `filter()`/`filterData` also learned `oneOf`: it strips against the branch
    the input actually matches and never sheds a field a valid interpretation
    keeps, so filtering a `oneOf`-valid value is lossless (it previously errored
    on `oneOf` outright).
- **`exclusiveMinimum` / `exclusiveMaximum` are now enforced** (#8). Previously
  ignored, so `{ exclusiveMinimum: 0 }` accepted `0`.
- Both are now in `ENFORCED_KEYWORDS`, so `agentContract` **accepts** schemas
  using them (it refused them before, as unenforced keywords).

### Added

- **`unenforcedKeywords(schema): string[]`** — lists the tree-paths where a
  schema uses something `validate` doesn't enforce (`allOf`, `not`, `$ref`,
  `if`/`then`, `patternProperties`, an unenforced `format`, …). The honest
  counterpart to `validate`'s boolean: it never throws (unlike `agentContract`,
  which refuses such schemas), so a consumer can **warn** that a keyword went
  unchecked instead of implying it was. Requested by tosijs-ui's
  `<tosi-schema-form>`.
- **`setWarnings(on: boolean)`** — enable/disable the runtime cost warning
  (process-global; re-enabling re-arms the once-per-process `oneOf` nudge).

## [1.7.0] — 2026-08-19

**Contains a BREAKING validation change** (`date-time` tightening) — see below
and the README "Upgrading to 1.7.0". Per this project's policy (README
"Versioning & stability"), validation getting stricter is treated as breaking
even though it lands in a minor.

### Fixed / Changed — BREAKING

- **`format: 'date-time'` now enforces RFC 3339** ([#7](https://github.com/tonioloewald/tosijs-schema/issues/7)).
  It was `!isNaN(Date.parse(v))`, which accepted non-RFC-3339 strings — a
  date-only `2020-01-01`, a space-separated `2020-01-01 10:00:00`, even
  `Jan 1 2020`. Those now **fail** `date-time`; a conforming validator (Ajv,
  etc.) rejected them all along, so schemas carrying them didn't travel. A
  date-time now requires the `T`, seconds, and a `Z`/offset.
  - **Migration:** validate calendar dates with the new `s.date` / `format: 'date'`;
    normalise timestamps to RFC 3339 (`2020-01-01T10:00:00Z`); or drop the
    `format` annotation if you only need `type: 'string'`.

### Added

- **`format: 'date'`** — RFC 3339 full-date (`YYYY-MM-DD`, day-in-month
  enforced, leap-year aware), now in `ENFORCED_FORMATS`, with a fluent `s.date` builder. `inferSchema(sample,
  { formats: true })` sniffs it **before** `date-time`, so a date-only column
  is labelled `date` (not the invalid `date-time` 1.6.x emitted) and the
  emitted schema validates against its own sample *in other tools too*, not
  just here. `format: 'date'` was previously ignored by `validate` (an
  annotation); it is now enforced.

## [1.6.1] — 2026-08-19

Patch — internal performance and test hardening from the v1.6.0 pre-release
review follow-ups. No behavior or API change.

### Changed (internal)

- **Validator hot path:** the multi-type resolution no longer allocates a
  `typeMatches` closure per visited node, and the common single-type path
  skips building a `type` array entirely. `pattern` regexes are compiled once
  and reused via a bounded cache (shared through `formats.ts`) instead of
  recompiled per value — previously a large array under a `pattern` schema
  recompiled the same regex per element. Behavior is identical (an invalid
  pattern still fails closed; the emoji `u`-flag variant stays a distinct key).
- **`inferSchema` sampling:** when `sampleSize` truncates, elements are copied
  up to the cap instead of flattening the whole input first.

### Tests

- Pinned strict-option propagation through the multi-type union dispatch
  (>97-item array), scalar constraints on a matched union branch, and
  pattern-cache semantics. `infer.ts` and `formats.ts` at 100% coverage.

## [1.6.0] — 2026-08-19

**Not breaking.** Everything here is new API or a *loosening* — nothing that
validated before is rejected now. (Contrast 1.5.0, whose tightening broke
consumers on install; this release adds the escape hatch that was missing,
see [#4](https://github.com/tonioloewald/tosijs-schema/issues/4) /
[#5](https://github.com/tonioloewald/tosijs-schema/issues/5) and the new
"Versioning & stability" section in the README.)

### Added

- **`inferSchema(sample, opts?)` → JSONSchema** — derive a schema from example
  data (the runtime inverse of `Infer<S>`) ([#6](https://github.com/tonioloewald/tosijs-schema/issues/6)).
  Unifies across every array element (not just `sample[0]`), presence decides
  `required`, `null` joins the type union, structure only (never infers
  `minimum`/`maxLength`/… from a sample's range), objects open by default
  (`additionalProperties: true`). `formats` and `enums` are opt-in and
  conservative; `sampleSize`/`onTruncate` cap and surface sampling.
  Deterministic, total on degenerate input, and guaranteed to accept its own
  sample: `validate(sample, inferSchema(sample))` is always `true`. Roots are
  stamped `$inferred: true` so a consumer can tell an *observed* schema from an
  *authored* one (pass `{ marker: false }` to omit) — requested from the tosijs
  side for `describe().contract` and drift-warning use.
- **Open objects** ([#5](https://github.com/tonioloewald/tosijs-schema/issues/5)):
  `s.object(props).open` (or `s.object(props, { additionalProperties: true })`)
  keeps the declared `properties`/`required` and admits unknown keys — the
  spelling for a shape that belongs to a protocol you don't control (an
  LLM chat message a provider keeps adding fields to). Previously the only
  open spelling was `s.record(s.any)`, which throws away properties, required,
  and field docs. Strict (`additionalProperties: false`) remains the default.
- **`tosijs-schema/infer` subpath export** — a self-contained ~1.3 kB module,
  so inference-only consumers don't pay for the validator/builder/contract
  code even where the pre-bundled main entry can't be tree-shaken.
- **`$inferred`** typed on the `JSONSchema` interface; allowed through
  `agentContract` (a pure annotation, like `$counterexamples`).

### Changed

- **Multi-type `type` arrays now validate with union semantics.** `{ type:
  ['string', 'number'] }` accepts a value matching *any* listed type (integer
  vs number distinction honored); the matching branch's applicators and
  constraints apply. Previously only the first listed type was enforced — a
  strict loosening (more data passes, none that passed now fails). This is
  what lets `inferSchema`'s union output validate its own sample, and
  `agentContract` no longer refuses multi-type arrays at construction (it now
  genuinely enforces them).

### Deprecated

- `s.infer(value)` — the builder's inference samples only the first array
  element and closes objects. Prefer `inferSchema`, the corrected version.

## [1.5.1] — 2026-08-09

### Fixed

- **`.optional` no longer leaks an internal marker into serialized schema
  output** ([#3](https://github.com/tonioloewald/tosijs-schema/issues/3)).
  1.5.0 tagged optional typeless builders (e.g. `s.any.optional`) with an
  `x-tjs-optional` key inside the schema JSON so `s.object()` could detect
  them as non-required. That flag now rides on the builder object instead, so
  it never appears in `.schema`, `describe()`, or any published artifact —
  `s.any.describe('x').optional` serializes to `{"description":"x"}`, and
  `s.any.optional` to `{}`. The flag carries through chaining in any order
  (`s.any.optional.describe('x')` stays optional). This also fully resolves
  the original ≤1.4.0 report — the invalid `{"type":[null,"null"]}` output —
  which 1.5.0 had already corrected.

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
- **`.optional` on typeless builders** (`s.const`, `s.union`, `s.any`): these
  previously emitted a malformed `type: [undefined, 'null']` and, combined
  with `const`/`anyOf` running before the null early-out, accepted either
  everything-but-null or (mid-1.5.0) nothing at all. `.optional` now expresses
  null-allowance in each builder's own vocabulary — `type` gains `'null'`,
  `const` becomes a typed enum listing `null`, `anyOf` gains a
  `{type:'null'}` branch — plus an `x-tjs-optional` annotation that lets
  `s.object()` treat typeless optionals (e.g. `s.any.optional`) as
  non-required. `s.record()` without a value schema now throws an actionable
  error instead of a bare TypeError.
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

[1.8.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.8.0
[1.7.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.7.0
[1.6.1]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.6.1
[1.6.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.6.0
[1.5.1]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.5.1
[1.5.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.5.0
[1.4.0]: https://github.com/tonioloewald/tosijs-schema/releases/tag/v1.4.0
