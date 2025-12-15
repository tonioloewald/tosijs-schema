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
* **Behavior:** Returns `boolean`. **Never throws** (unless explicitly asked via callback). Does **not** allocate new objects.
* **Optimization:**
    * **Stochastic Sampling:** If an array or dictionary is large (>97 items) and `fullScan` is false, it checks indices at prime intervals (stride 97) to statistically verify structure in O(1).
    * **Ghost Constraints:** `maxProperties` on objects is documented in the schema but **ignored** at runtime to prevent O(N) key counting overhead.

### C. Monadic Pipelines (`src/monad.ts`)

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
User.validate(data, { fullScan: true })
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


* **Type Tests (`src/inference.types.ts`):** Run with `tsc --noEmit`.
* **DO NOT run this file with Bun.** It contains intentional type errors (using `@ts-expect-error`) to verify compilation failures. It is not designed to execute.



## 5. Known Constraints & Gotchas
1. **`s.any`:** Generates an empty schema `{}`. The validator has special logic to allow `null`/`undefined` when no `type` is present.
2. **Hoisting:** The `validate` function is defined after `create` in `schema.ts`, but attached to the builder via closure. This works fine at runtime but requires care if refactoring order.
3. **No Transformers:** Do not attempt to add `z.transform()` style logic. This library validates data *as is*.
