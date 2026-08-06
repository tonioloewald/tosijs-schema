# Project Context: `tosijs-schema`

## 1. Project Overview
**tosijs-schema** is a lightweight, high-performance, schema-first alternative to Zod. It is designed specifically for:
1.  **LLM Agents:** Produces clean, flat, strict JSON Schemas optimized for OpenAI Structured Outputs.
2.  **High Performance:** Uses "prime-jump" stochastic sampling to validate massive arrays and dictionaries in **O(1)** time.
3.  **Type Safety:** Infers TypeScript types directly from the schema definitions.

**Core Philosophy:**
* **Schema-First:** The source of truth is a standard JSON Schema object.
* **Validation-Only:** Unlike Zod, it does *not* transform or coerce data. It checks structure in-place.
* **Strict by Default:** Objects are non-extensible (`additionalProperties: false`) and all keys are required by default.

## 2. Key Architecture

### A. The Schema Builder (`src/schema.ts`)
The library exposes a proxy `s` that builds JSON Schema objects via a fluent API.
* **Implementation:** It uses a recursive `Base<T>` interface ("The Lie") for TypeScript inference, backed by a `create()` function ("The Truth") that builds the actual JSON object.
* **Proxy:** `s` uses a Proxy to lazily generate primitive schemas (`s.string`, `s.number`).
* **Convenience:** All schema builders expose a `.validate(data)` method for DX, which proxies to the standalone validator.

### B. The Validator (`src/schema.ts`)
The `validate` function is the core engine.
* **Signature:** `validate(value, schemaOrBuilder, options?)`
* **Behavior:** Returns `boolean`. **Never throws** (invalid `pattern` regexes fail closed rather than raising; only a throwing `onError` callback can escape). Allocation is minimal (one path array; anyOf branch trials allocate an options object).
* **Optimization:**
    * **Stochastic Sampling:** If an array or dictionary is large (>97 items) and `strict` is false (`fullScan` is the deprecated alias), it checks indices at prime intervals (stride 97) to statistically verify structure in O(1).
    * **Ghost Constraints:** `maxProperties` on objects is documented in the schema but **ignored** at runtime (unless `strict`) to prevent O(N) key counting overhead.
* **Enforcement notes:** `additionalProperties: false` rejects unknown keys (and `s.object()` emits it by default); `minItems`/`maxItems` apply with or without an `items` schema; typeless schemas apply object/array keywords when the value matches (JSON Schema semantics); `format` values outside `ENFORCED_FORMATS` are ignored annotations (but refused by `agentContract`).

### C. Agent Contracts (`src/contract.ts`)

Adapters for capability-gated write paths (tosijs's agent surface, or anything with the same seam shape).
* **`agentContract(schemas, options?)`:** Maps root path → schema into `{ check, describe }`. `check(path, value, proposal?)` judges the whole-root `proposal.proposed` (never walks paths itself) and returns `true | Error` (the Error message is the refusal reason). Strict validation by default — pass `{ strict: false }` to allow sampling.
* **Fail-closed invariants (do not weaken):** schemas are deep-copied at construction AND out of `describe()` (mutation cannot disarm the gate); construction validates against an ALLOWLIST — any key outside `ENFORCED_KEYWORDS` (exported beside the walk in `schema.ts`) + annotations + `x-*` throws, which catches `allOf`/`oneOf`/`not`/`$ref`, typos, and future spec keywords alike — plus value-level holes: `format` outside `ENFORCED_FORMATS`, invalid `pattern` regexes, uncapped tuple `items`, non-primitive `const`/`enum` members, multi-type arrays, and nested contracted roots (ambiguous judge); protocol breaches return an Error — any write touching a contracted root (at, under, or ABOVE it, incl. the empty path) without a proposal for that exact root, `proposal.root` mismatch, ancestor writes spanning several contracted roots (one proposal can't cover them — decompose), and a contracted `$predicate` with no registered evaluator. Boolean schemas are legal and enforced (`false` = refuse all, `true` = accept all).
* **`checkExamples(schemaOrBuilder)`:** Definition-time lint. Recursively verifies every `examples` entry passes its own node and every `$counterexamples` entry fails. Counterexamples that pass structurally under a `$predicate` with no registered evaluator report `unverifiable`, not `accepted`.
* **Guarantee:** `validate` ignores and never mutates unknown `$`-prefixed and `x-*` keys — extension conventions ride along safely.

### D. Monadic Pipelines (`src/monad.ts`)

The `M` module implements "Railway Oriented Programming" for building safe tool chains (Agents).
* **`M.func(Input, Output, Impl, TimeoutMs?)`:** Wraps a function with strict input/output schema validation (Async) and timeout enforcement (default 5000ms).
* **`new M(Registry)`:** Creates a fluent (Async) chain where functions are invoked sequentially. Errors propagate automatically, bypassing subsequent steps.
* **Inference:** TypeScript automatically infers the input/output types of the implementation function from the passed schemas.

## 3. Usage Patterns

### Defining Schemas

```typescript
import { s, type Infer } from './src/schema'

const User = s.object({
  id: s.string.uuid,
  tags: s.array(s.string).min(1), // O(1) validated
  meta: s.any // Permissive type
})

type UserType = Infer<typeof User>
```

### Validation

```typescript
// method style (preferred DX)
if (User.validate(data)) { ... }

// standalone style
import { validate } from './src/schema'
validate(data, User)

// strict mode (disables stochastic sampling)
User.validate(data, { strict: true })
```

### Monads

```typescript
import { M } from './src/monad'
const chain = new M({
  step1: M.func(s.string, s.number, (str) => str.length)
})

const result = chain.step1("hello").result() // Returns number | SchemaError
```

## 4. Testing Strategy
* **Runtime Tests (`*.test.ts`):** Run with `bun test`.
* `src/any.test.ts`: Tests `s.any` behavior.
* `src/monad.test.ts`: Tests the `M` class execution and error flow.
* `src/contract.test.ts`: Tests `agentContract`, `checkExamples`, and the `$`-key passthrough guarantee.
* `src/predicate.test.ts`: Tests the `$predicate` keyword and evaluator registration.


* **Type Tests (`src/inference.types.ts`):** Run with `tsc --noEmit`.
* **DO NOT run this file with Bun.** It contains intentional type errors (using `@ts-expect-error`) to verify compilation failures. It is not designed to execute.



## 5. Known Constraints & Gotchas
1. **`s.any`:** Generates an empty schema `{}`. The validator has special logic to allow `null`/`undefined` when no `type` is present.
2. **Hoisting:** The `validate` function is defined after `create` in `schema.ts`, but attached to the builder via closure. This works fine at runtime but requires care if refactoring order.
3. **No Transformers:** Do not attempt to add `z.transform()` style logic. This library validates data *as is*.

## 6. Roadmap / Future Ideas

### `json-schema-maximus`
A potential future project: a **fully spec-compliant** JSON Schema Draft 2020-12 validator built on agent-99's safe eval.

**Motivation:** All existing spec-compliant validators (TypeBox, Ajv) use `new Function()` / eval for performance. This is architecturally ironic - using code generation to implement a safety specification. They can't run in CSP-restricted or sandboxed environments without workarounds.

**Approach:**
- Use agent-99's safe eval to handle the complex/recursive corners of JSON Schema (`$ref`, `if/then/else`, `allOf/oneOf/not`, `unevaluatedProperties`)
- Gas-limited execution prevents pathological schemas from causing DoS
- Capability-based security keeps it sandboxed
- Zero `eval` / `new Function()`

**Open questions:**
- Performance: How slow is safe eval for CPU-bound validation? The 7% overhead for tjs is promising.
- Async vs sync: If safe eval requires async, millions of awaits per large dataset could be prohibitive. A sync mode for pure computation (no capability requests) might be needed.

**Goal:** The only JSON Schema validator that isn't architecturally compromised. If it lands within 2-3x of Ajv's speed, that's a compelling tradeoff for security-sensitive environments.

---

# tosijs-schema Examples

> This document is generated automatically by running `bun examples.ts`.

## 1. Basic Object & Metadata

Demonstrates basic primitives, first-class integers, UUID formats, and top-level metadata ($id, $schema).

### Definition
```typescript
const Person = s.object({
  id: s.string.uuid,
  name: s.string.min(2).title("Full Name"),
  age: s.integer.min(0).max(120),
  email: s.string.email.optional,
  tags: s.array(s.string).min(1)
}).meta({
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://example.com/schemas/person',
  title: 'Person',
  description: 'A human being record'
})
```

### JSON Schema Output
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://example.com/schemas/person",
  "title": "Person",
  "description": "A human being record",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string",
      "minLength": 2,
      "title": "Full Name"
    },
    "age": {
      "type": "integer",
      "minimum": 0,
      "maximum": 120
    },
    "email": {
      "type": [
        "string",
        "null"
      ],
      "format": "email",
      "x-tjs-optional": true
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "minItems": 1
    }
  },
  "required": [
    "id",
    "name",
    "age",
    "tags"
  ],
  "additionalProperties": false
}
```

## 2. Dictionaries & Ghost Constraints

Demonstrates `s.record` (additionalProperties) and the "Ghost" constraint behavior. `minProperties` (1) is validated strictly, while `maxProperties` (10) is included in the schema for documentation but ignored by the runtime validator for performance.

### Definition
```typescript
const AppConfig = s.record(s.union([s.string, s.number, s.boolean]))
  .min(1)   // Validated: Must have at least 1 key
  .max(10)  // Ghost: Documented max 10, but not validated
  .describe("Application Feature Flags")
```

### JSON Schema Output
```json
{
  "type": "object",
  "additionalProperties": {
    "anyOf": [
      {
        "type": "string"
      },
      {
        "type": "number"
      },
      {
        "type": "boolean"
      }
    ]
  },
  "minProperties": 1,
  "maxProperties": 10,
  "description": "Application Feature Flags"
}
```

## 3. Unions & Enums

Demonstrates discriminating unions (like `oneOf` / `anyOf`) using Enums to differentiate between Success and Error states.

### Definition
```typescript
const Success = s.object({
  status: s.enum(['success']),
  data: s.object({ id: s.integer }),
  timestamp: s.string.datetime
})

const Error = s.object({
  status: s.enum(['error']),
  code: s.integer,
  message: s.string
})

const ApiResponse = s.union([Success, Error])
```

### JSON Schema Output
```json
{
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "success"
          ]
        },
        "data": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer"
            }
          },
          "required": [
            "id"
          ],
          "additionalProperties": false
        },
        "timestamp": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "status",
        "data",
        "timestamp"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "error"
          ]
        },
        "code": {
          "type": "integer"
        },
        "message": {
          "type": "string"
        }
      },
      "required": [
        "status",
        "code",
        "message"
      ],
      "additionalProperties": false
    }
  ]
}
```

## 4. Tuples

Demonstrates fixed-length arrays where position matters (e.g., [Latitude, Longitude]).

### Definition
```typescript
const Coordinate = s.tuple([s.number, s.number])
  .describe("Lat/Long Pair")
```

### JSON Schema Output
```json
{
  "type": "array",
  "items": [
    {
      "type": "number"
    },
    {
      "type": "number"
    }
  ],
  "minItems": 2,
  "maxItems": 2,
  "description": "Lat/Long Pair"
}
```

## 5. Validation Usage

Demonstrates the flexible `validate` signature. You can pass the builder object directly or the raw JSON schema.

### Code
```typescript
import { s, validate } from 'tosijs-schema'

const User = s.object({
  id: s.integer,
  email: s.string.email
})

const data = { id: 123, email: "alice@example.com" }

// 1. Method Style (Builder)
User.validate(data)

// 2. Functional Style (Builder)
validate(data, User)

// 3. Functional Style (Raw Schema)
validate(data, User.schema)

// 4. External / Literal JSON Object
const externalSchema = {
  type: "object",
  properties: {
    count: { type: "integer" }
  }
}
validate({ count: 10 }, externalSchema)
```

## 6. Agent Contracts & Examples-as-Tests

Demonstrates `agentContract` — the adapter for capability-gated write paths (e.g. the tosijs agent surface). `check()` judges a proposed whole-root value and returns `true` or an `Error` carrying the refusal reason; `describe()` returns the serializable per-root contract. The `examples` / `$counterexamples` conventions make the contract self-proving: `checkExamples()` lints that every example passes and every counterexample fails, at definition time.

### Definition
```typescript
const Order = s.object({
  item: s.string,
  qty: s.number.min(1),
}).meta({
  examples: [{ item: 'kumquat', qty: 3 }],
  $counterexamples: [{ item: 'kumquat' }, { item: 42, qty: 1 }],
})

const contract = agentContract({ 'app.order': Order })

contract.check('app.order.qty', 'x', {
  root: 'app.order',
  proposed: { item: 'yuzu', qty: 'x' },
})
// Error: contract violation at app.order.qty — qty: Expected number

checkExamples(Order) // [] — the spec doesn't lie
```

### JSON Schema Output
```json
{
  "examples": [
    {
      "item": "kumquat",
      "qty": 3
    }
  ],
  "$counterexamples": [
    {
      "item": "kumquat"
    },
    {
      "item": 42,
      "qty": 1
    }
  ],
  "type": "object",
  "properties": {
    "item": {
      "type": "string"
    },
    "qty": {
      "type": "number",
      "minimum": 1
    }
  },
  "required": [
    "item",
    "qty"
  ],
  "additionalProperties": false
}
```

### Refusal Output
```
Error: contract violation at app.order.qty — qty: Expected number
checkExamples findings: []
```