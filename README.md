# tosijs-schema

[npm](https://www.npmjs.com/package/tosijs-schema) | [github](https://github.com/tonioloewald/tosijs-schema) | [discord](https://discord.gg/ramJ9rgky5) | [examples](./examples.md)

[![npm](https://badge.fury.io/js/tosijs-schema.svg)](https://www.npmjs.com/package/tosijs-schema)
[![size](https://deno.bundlejs.com/?q=tosijs-schema&badge=)](https://bundlejs.com/?q=tosijs-schema&badge=)

A **schema-first** validation library. Define schemas, infer TypeScript types, validate efficiently.

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

This matters: our 96.6% test coverage covers **every schema you'll ever write** because your schemas are just JSON objects that flow through the same tested validation code.

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
| Bundle | ~3kB | ~14kB | ~64kB |
| Schema objects | Plain JSON (~200B) | Class instances (~3-5KB) | JSON Schema objects |
| Runtime deps | 0 | 0 | 0 |
| Performance | ~2x faster + O(1) sampling | O(n) | JIT compiled (~27x faster full scan) |
| Runtime schemas | **Yes (direct)** | No | Yes (with preprocessing) |
| Uses `eval` / `new Function()` | No | No | Yes (JIT compiler) |
| Test coverage | 96.6% (covers YOUR schemas) | Battle-tested | Battle-tested |
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

tosijs-schema implements a **practical subset** of JSON Schema - the features that cover real-world use cases, not the full specification. This is a deliberate tradeoff: ~3kB bundle vs spec compliance.

**Supported:** `type`, `properties`, `required`, `items`, `enum`, `const`, `anyOf` (unions), `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `minProperties`, `maxProperties`, `additionalProperties`, `format` (common formats), `default`, `title`, `description`

**Not supported:** `$ref` / `$defs`, `if` / `then` / `else`, `dependentRequired`, `patternProperties`, `unevaluatedProperties`, `allOf`, `oneOf`, `not`, and other advanced keywords

If you need full JSON Schema Draft 2020-12 compliance and `eval` is acceptable in your environment, TypeBox or Ajv are options. If you need the 80% of features that cover 99% of real-world schemas in a tiny, eval-free package, use tosijs-schema.

**A note on `eval` and security:** JSON Schema exists to define safe data contracts for interchange between untrusted parties. TypeBox's JIT compiler uses `new Function()` to generate validators - executing dynamically constructed code strings. There's an architectural irony in using code generation to implement a safety specification. For sandboxed environments, edge functions, or anywhere CSP restricts `unsafe-eval`, tosijs-schema validates without code generation.

### When to Use Zod

- You need tRPC, react-hook-form, or other Zod ecosystem integrations
- You want transforms/refinements in your schema layer
- Ecosystem momentum matters more than architecture

### When to Use TypeBox

- You have a fixed set of schemas known at startup (compile once, validate millions)
- You need maximum validation throughput (high-traffic APIs, real-time pipelines)
- You're building with Fastify or Elysia (native TypeBox support)
- `new Function()` / eval is acceptable in your security model
- Bundle size isn't a primary concern (~64kB vs ~3kB)

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
s.datetime        s.emoji           s.pattern(/.../)
```

### Complex Types

```typescript
s.object({ key: s.string })     // Object with specific properties
s.array(s.number)               // Array of numbers
s.record(s.string)              // Record<string, string>
s.tuple([s.string, s.number])   // Fixed-length tuple
s.enum(['a', 'b', 'c'])         // String enum
s.union([s.string, s.number])   // Union type
s.const('literal')              // Literal value
```

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

Validates every item. Also enforces `maxProperties`.

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
| `maxProperties` only in strict mode | Counting is O(n), defeats sampling optimization |
| `additionalProperties: false` not enforced | Use `filter()` to strip extra properties |

## Test Coverage

```
File           | % Funcs | % Lines
---------------|---------|--------
All files      |   98.25 |   96.62
 src/monad.ts  |  100.00 |  100.00
 src/schema.ts |   96.49 |   93.24
```

146 tests, 349 assertions.

## License

MIT
