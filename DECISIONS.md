# DECISIONS

Design records and decided-against notes for tosijs-schema. Open work lives on
the [Virta board](https://virta.tosijs.net/host/#?virta.scope=tosijs-schema),
not here. This file records *why* things are the way they are, so they are not
re-litigated. A decided-against note is only as good as its reconsider-if
trigger, so each one names its trigger.

Moved here from `TODO.md` when the repo was onboarded to the board
(2026-09-26). Older review records live in `reviews/`.

## The unwrap: fix the root cause, not the discriminator (2026-09-17, shipped 1.12.0)

Board: #1390. Analysed after three blocked 1.11.0 review rounds. 1.11.0 shipped
with the unwrap reverted to 1.10.2 semantics.

The problem is not "the discriminator is wrong". `validate`'s second parameter
accepts three shapes, and two of them cannot be told apart by looking at them:

| shape | `.schema` | `.validate` | survives JSON | declares keywords |
| --- | --- | --- | --- | --- |
| builder | Y | Y | **fn is LOST** | 0 |
| wrapper (`{name,strict,schema}`) | Y | n | yes | 0 |
| schema + stray `schema` key | Y | n | yes | 4 |

Builder detection was a duck-type that dies on a JSON round-trip. The only thing
that separates a wrapper from a stray key is "declares keywords", and that
heuristic fails when a schema declares only unenforced keywords or an envelope
carries an annotation. The review's converged rule (ENFORCED_KEYWORDS
membership plus value shape) is a better heuristic, but it is still a
heuristic. It misreads `{ contentEncoding:'base64', schema:true }`. Don't ship it.

**Decision:** make detection a fact, and refuse what is genuinely ambiguous.
Brand builders with `Symbol.for('tosijs-schema.builder')`. Wire data can't forge
a Symbol and it doesn't survive `JSON.stringify`. A non-builder carrying a
`schema` key is ambiguous, so fail closed (`false` plus an `onError` reason,
never a throw). This deletes every keyword list and reachability argument, and
it closes the original stray-key fail-open. It is breaking, so it gets its own
release and its own review.

As shipped (1.12.0), `isBuilder` accepts the brand OR a callable `validate`
beside `schema` — the latter so builders from a pre-brand installed copy still
work. That costs nothing: JSON can carry neither a symbol nor a function, so
wire data still cannot pose as a builder. Shipped together with #1391 because
that fix is the brand's second consumer; #1390 was committed first so #1391
could be dropped if its review blocked.

**Keep the pre-brand duck-type (decided 2026-10-01).** `src/crossversion.test.ts`
tests real copies: the npm 1.11.0 release (devDependency alias) and a second
module instance of this tree. Both halves of `isBuilder` are load-bearing:
dropping the duck-type breaks 1.11.0 builders, and dropping the brand breaks a
second copy's method-stripped builder. Reconsider if pre-1.12 copies can no
longer appear beside a current one, i.e. at the next major, or when no
ecosystem consumer's range admits <1.12.

## Builder construction silently accepts a plain schema (2026-09-17, fixed 1.12.0)

Board: #1391. `s.array({ type: 'string' })` builds `{ type: 'array' }` with no
`items` (fails open, silently). `s.object({ a: {type:'string'} })` throws a raw
TypeError. It is the same family as the unwrap: something that *looks* close
enough gets a permissive result. It was deliberately kept out of 1.11.0: that
release had already been blocked twice, and bolting on more unreviewed changes
is what produced those blocks. Fix it with one shared `assertBuilder`, finding
the entry points by reading the factory rather than grepping. Reading it found
five: `union`, `array`, `tuple`, `object`, `record`. The original note also
listed `s.infer`, but that takes data, not builders — grepping would have
guarded the wrong thing.

## The `pattern` ReDoS decision (2026-09-14)

Board: "Unbounded `pattern` ReDoS in `validate`". Verified exponential at
v1.10.2: `^(a+)+$` against a 32-byte payload takes 389ms, doubling every ~4
bytes. Three facts decide the shape:

1. A length cap does not work. Blowup starts at 32 bytes, and any cap loose
   enough for emails, URLs and names is loose enough to hang.
2. A JS regex cannot be interrupted. A timeout needs a worker or another
   engine, and either one breaks the zero-dependency promise and the size budget.
3. Static ReDoS detection is undecidable in general, so any screen has false
   negatives and must be called a mitigation, not a fix.

**Decision:** `validate` stays as it is. Any change would be breaking and
couldn't be correct, so document instead that `pattern` runs a
consumer-supplied regex against consumer-supplied data, and neither is
sandboxed. `agentContract` refuses patterns that fail a cheap static screen at
construction. That is where untrusted schemas arrive, and the gate can afford
the strictness. Export the screen so consumers can lint their own schemas
(the enumerate tier, like `unenforcedKeywords`), and document its false
negatives. That makes it a minor.

## A path tokenizer for `agentContract` (decided in 1.10.0)

Board: "A path TOKENIZER for `agentContract`'s matcher". 1.10.0 built a
regex-canonicalizing matcher and reverted it before shipping. Four review passes
each found another bypass. String folding merged distinct locations
(`a["b.c"]` is one key), and the regex was quadratic on unbalanced brackets.
Decided design: parse roots and paths into segment arrays and match by array
prefix. A parse failure fails closed. Write the grammar down first. Refuse
element-scoped roots (`list[0]`, `list[id=666]`) at construction. Ship it with a
hostile-input test (a 200k-char path must stay cheap).

## `oneOf`: decided against, then reversed (2026-08-19 → 2026-08-23)

`oneOf` was deliberately left out on 2026-08-19: `anyOf` covers real unions,
mutual exclusion is a footgun (`oneOf:[number,integer]` rejects `5`), and it
can't short-circuit. Four days later issue #8 (tosijs-ui's
`<tosi-schema-form>`) reversed that decision. A real consumer was silently
under-served, because `validate` ignored `oneOf` and failed open. v1.8.0
enforces it (exactly one branch must match). The "prefer `anyOf`" advice
survives as a warning, once per process, about the cost. Kept as a worked
example: the note's own reconsider-if trigger ("a consumer needs to validate
external JSON Schema off the wire") is exactly what #8 turned out to be.

## The fail-open sweep (shipped in 1.11.0, 2026-09-16)

Four releases in a row (#8, #9, #10, 1.10.0) each closed one fail-open after
the fact. 1.11.0 listed the whole class first and fixed it together. A non-enumerable own
property escaped `additionalProperties: false`, both in `validate` and at the
gate (`proposal.proposed` is a live object, not JSON). Also, an
`additionalProperties: <schema>` never validated such a key. The root cause
was reading objects through a lens that misses part of them (`for..in` +
`hasOwn`). The fix was `Object.getOwnPropertyNames`, and it measured 10-20%
*faster* through the real validator. `filter` needed no change, because it
rebuilds objects from `Object.keys`.

## Smaller decisions (don't re-litigate)

`anyOf`/`oneOf` branch loops stay as two explicit loops (v1.8.0 review).
Merging them hides the short-circuit vs full-count difference. Reconsider if a
third union keyword lands (then extract `countMatches(v, branches, cap)`).

No warning on a `true` with zero affected roots (v1.9.1 review, #10 blast radius).
It would fire as often for intended partial contracts as for the buggy
configuration. Reconsider if a second consumer hits #10's shape.

Bounded dictionaries enumerate keys twice (KEEP, 2026-09-14). The two passes
count different things (all own keys vs undeclared keys), so they can't merge
without losing the short-circuit. The cost is asymptotically neutral, and it sits
in the sampling hot path.

`describe()` does not carry the gate's `unknownPath` posture (2026-09-14). Its
keys are caller-supplied root names, so any posture key could collide with a
real root. A sibling member is the right shape, but adding a required interface
member breaks implementers, so it waits for a minor. The rationale is in the JSDoc.

`affectedRoots` returns a fresh copy that callers may mutate (2026-09-14). It is
documented, and tampering with it can't affect the gate.

GHSA vs CHANGELOG for the 1.8.0 fail-open fixes: CHANGELOG only (2026-08-24).
Nothing downstream treats `validate()`'s boolean as an auth boundary, and under
`^1.x` every consumer floats to the fix. The advisory bar is for consumers who
*can't* reach the fix. The ≤1.4.0 bypasses got GHSA-3qw7-pvr3-2gpq.

## Build and smoke-lane findings

`bunx tsc` in a scratch directory silently resolves a different TypeScript
(7.0.2 vs the repo's pinned 5.9.2). `smoke.ts` now runs the repo's own
`node_modules/.bin/tsc` by absolute path. Remember this when writing any gate
that shells out to a tool.

`smoke.ts` shells out to `npm pack` / `npm install` on purpose, despite the
"Bun for everything" rule. npm is what publishes, so the lane has to test npm's
`files` packing.

Committed `dist/` must reproduce in CI (OIDC publishing, 2026-09-26), so
`.bun-version` pins the build Bun and `pack` refuses any other version
(`check-bun`). Before this, `files: ["dist"]` shipped macOS's
`dist/.metadata_never_index` in every tarball from at least 1.8.0 through 1.10.2. The files negation
plus `rm -rf dist` at the start of `pack` closed that.

## KB write-back ledger

Reviewed-repo range → `tosijs-coding-practices` commit.

```
v1.6.0 review (v1.5.1..142e007) → KB 50580f9
v1.7.0 review (v1.6.1..894b3ff) → KB f8e3cac
v1.8.0 review (v1.7.0..0da18e9) → KB 58ece17
```
