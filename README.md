# tosijs-schema

[npm](https://www.npmjs.com/package/tosijs-schema) | [github](https://github.com/tonioloewald/tosijs-schema) | [discord](https://discord.gg/ramJ9rgky5) | [examples](/examples.md)

A **schema-first** Typescript / Javascript library for generating a single, standards-compliant source of truth for data types.

1.  **Define** data types once using standard [json-schema](https://json-schema.org/)
2.  **Infer** Typescript types automatically
3.  **Validate** efficiently, using "prime-jump" sampling for O(1) performance on massive arrays **and dictionaries**
4.  **Diff** schemas to detect breaking changes or structural drift

Smaller, faster, smarter, and safer.

Oh and it cheats when validating large datasets…

```text
🔥 GENERATING DATA...
   - Array:  1,000,000 items (Complex Union)
   - Object: 100,000 keys  (Complex Union)

👉 ROUND 1: Huge Array (Complex Union)
   Tosi (Skip): 0.7073 ms   (✅)
   Tosi (Full): 185.0291 ms   (✅)
   Zod:         347.2791 ms   (✅)
   ----------------------------------
   🚀 vs Zod: 491.0x faster (Optimized)
   🏎  vs Zod: 1.9x faster (Raw Engine Speed)

👉 ROUND 2: Huge Object (Complex Union)
   Tosi (Skip): 5.5037 ms    (✅)
   Tosi (Full): 27.8601 ms   (✅)
   Zod:         55.7039 ms   (✅)
   ----------------------------------
   🚀 vs Zod: 10.1x faster (Optimized)
   🏎  vs Zod: 2.0x faster (Raw Engine Speed)
```

> By the way: these test results get better and better for tosijs-schema as I run them repeatedly, suggesting that tosijs-schema also benefits more greatly from hotspot optimization.

## Installation

```bash
npm install tosijs-schema
# or
bun add tosijs-schema
```

## Defining a schema

`tosijs-schema` uses a clean, property-based syntax. Properties like `string`, `email`, or `optional` are getters, keeping definitions concise.

You can also attach **Metadata** (`title`, `describe`, `default`) to any node. This doesn't affect validation but is crucial for generating rich API documentation (Swagger/OpenAPI).

```typescript
import { s, type Infer } from 'tosijs-schema'

// 1. Define the Runtime Schema
// This builds a standard JSON Schema object under the hood
export const UserSchema = s
  .object({
    id: s.string.uuid, // Property access (no parentheses)

    email: s.string.email
      .describe("User's primary contact")
      .default('anon@example.com'), // Metadata

    role: s.enum(['admin', 'editor', 'viewer']),

    // First-class Integer support
    score: s.integer.min(0).max(100),

    tags: s.array(s.string).optional, // .optional is a property

    // Dictionaries (Record<string, number>) with constraints
    // .min(1) = minProperties: 1
    meta: s.record(s.number).min(1),
  })
  .meta({
    $id: '[https://api.mysite.com/schemas/user](https://api.mysite.com/schemas/user)',
    title: 'UserProfile',
  })

// 2. Infer the Compile-time Type
export type User = Infer<typeof UserSchema>
// Result:
// {
//   id: string;
//   email: string;
//   role: "admin" | "editor" | "viewer";
//   score: number;
//   tags?: string[] | undefined;
//   meta: Record<string, number>;
// }
```

## Runtime validation

`tosijs-schema` separates **Type Safety** (Is this valid?) from **Debugging** (Why is it invalid?).

### 1\. The "Fast" Path (Default)

By default, validation is optimized for speed and returns a boolean.

**Performance Note:** For large arrays (\>97 items) and large dictionaries, `tosijs-schema` uses a "prime-jump" strategy. It checks a fixed sample of items (roughly 1%) regardless of size. This provides **O(1)** performance while maintaining a high statistical probability of catching errors.

```typescript
import { validate } from 'tosijs-schema'

const data = await fetchUsers()

// Returns true/false. Blazing fast.
if (!validate(data, UserSchema.schema)) {
  console.error('Invalid data received')
}
```

### 2\. The "Strict" Path (Full Scan)

If you need 100% guarantee (e.g., critical financial data), you can disable the optimization.

```typescript
// Forces checking of EVERY item in arrays and keys in objects
validate(data, UserSchema.schema, { fullScan: true })
```

### 3\. Error Reporting & Debugging

To get detailed error messages, provide an `onError` callback.

_Note: The validator "Fails Fast". It stops at the **first** error it finds to save CPU cycles._

```typescript
// Option A: Log Errors
validate(data, UserSchema.schema, (path, msg) => {
  console.error(`Error at ${path}: ${msg}`)
})

// Option B: Throw on Error
validate(data, UserSchema.schema, (path, msg) => {
  throw new Error(`Validation failed at ${path}: ${msg}`)
})

// Option C: Options Object Syntax
validate(data, UserSchema.schema, {
  fullScan: true, // You can combine fullScan with logging
  onError: (path, msg) => console.error(path, msg),
})
```

## Object Constraints & "Ghost" Properties

You can use `.min(n)` and `.max(n)` on Objects and Records to set `minProperties` and `maxProperties`.

**The "Ghost" Constraint:**

- **`minProperties`:** Is validated strictly. (e.g., A dictionary must have at least 1 item).
- **`maxProperties`:** Is added to the JSON Schema output (for documentation/Swagger) but is **IGNORED** by the validator.

**Why?** Validating `maxProperties` requires counting every key in an object, which is an O(N) operation. If a malicious user sends a payload with 100,000 keys, validating the count wastes CPU cycles after the memory has already been allocated by `JSON.parse`. We assume your business logic or database will handle quota limits, keeping the schema validator focused on _structure_.

## Schema Diffing

Check the difference between two schemas to spot API changes or version drifts.

```typescript
import { diff } from 'tosijs-schema'

const V1 = s.object({ id: s.number })
const V2 = s.object({ id: s.integer }) // Changed type

console.log(diff(V1.schema, V2.schema))
// Output: { id: { error: "Type mismatch: number vs integer" } }
```

## API Reference

### Primitives & Properties (No Arguments)

Use these as static properties.

- **Base:** `s.string`, `s.number`, `s.integer`, `s.boolean`, `.optional`
- **String Formats:** `.email`, `.uuid`, `.ipv4`, `.url`, `.datetime`, `.emoji`
- **Number Formats:** `.int` (casts number to integer schema)

### Constraints (Arguments Required)

Use these as chainable methods.

- **String:** `.pattern(/regex/)`, `.min(length)`, `.max(length)`
- **Number/Integer:** `.min(value)`, `.max(value)`, `.step(value)`
- **Array:** `.min(count)`, `.max(count)`
- **Object/Record:** `.min(count)`, `.max(count)` (Note: `.max` is documentation only)

### Metadata

Available on all types to enrich the JSON schema output.

- `.title("...")`
- `.describe("...")` maps to `description`
- `.default(value)`
- `.meta({ ... })` merges arbitrary JSON keys (e.g., `$id`, `$schema`, `examples`)

### Complex Types

- **Arrays:** `s.array(s.string)`
- **Objects:** `s.object({ key: s.string })`
- **Records:** `s.record(s.number)` — Maps to `additionalProperties`.
- **Enums:** `s.enum(['a', 'b'])`
- **Unions:** `s.union([s.string, s.number])` — Maps to TypeScript unions (`|`) and JSON Schema `anyOf`.
- **Tuples** `s.tuple([s.string, s.number])` — Fixed-length arrays.

## Limitations

To keep the library _tiny_ and _fast_, specific JSON Schema features are **not** implemented:

- **Deep Constraints:** `uniqueItems` and `dependencies` are omitted for performance.
- `maxProperties` for objects is added to the schema, but the validator doesn't check.
- **Recursive Types:** TypeScript inference for circular references (e.g., Trees) is not currently supported in the builder API.

> In my opinion, `minProperties` makes perfect sense when checking for objects treated as hash-mapped arrays being non-empty, but `maxProperties` makes no sense and is non-trivial to implement.

## Why not Zod?

[Zod](https://zod.dev/) is an excellent library, but it is **TypeScript-first** and relies on a heavy Object-Oriented class hierarchy. Real-world Zod bundles can be heavy because it does not tree-shake well.

`tosijs-schema` is **Schema-first** and **Functional**.

- **Portable:** The output is standard JSON Schema, usable by other tools/languages.
- **Tiny:** \~3kB minified.
- **Performance:** Uses "prime-jump" sampling for **O(1)** validation of massive arrays and dictionaries (vs Zod's O(N)). Even in full-scan mode, it is \~2x faster due to raw recursion.

Both have zero dependencies. Choose the one that meets your needs.

## License

MIT
