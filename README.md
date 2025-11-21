# tosijs-schema

A schema-first Typescript / Javascript library for generating a single, standards-compliant source of truth for data types.

1.  **Define** data types once using standard [json-schema](https://json-schema.org/)
2.  **Infer** Typescript types automatically
3.  **Validate** efficiently, using "prime-jump" sampling for O(1) performance on massive arrays
4.  **Diff** schemas to detect breaking changes or structural drift

## Installation

```bash
npm install tosijs-schema
# or
bun add tosijs-schema
```

## Defining a schema

`tosijs-schema` uses a clean, property-based syntax. Properties like `string`, `email`, or `optional` are getters, not functions, keeping definitions concise.

```typescript
import { s, type Infer } from 'tosijs-schema'

// 1. Define the Runtime Schema
// This builds a standard JSON Schema object under the hood
export const UserSchema = s.object({
  id: s.string.uuid, // Property access (no parentheses)
  email: s.string.email, // Property access
  role: s.enum(['admin', 'editor', 'viewer']),
  score: s.number.min(0).max(100), // .min() still requires arguments
  tags: s.array(s.string).optional, // .optional is a property
  metadata: s.union([s.string, s.number]), // Union support
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
//   metadata: string | number;
// }
```

## Runtime validation

The validator returns `true` or `false`.

**Note on Performance:** For large arrays, `tosijs-schema` uses a "prime-jump" strategy. Instead of checking every single item (which freezes the main thread on large datasets), it checks items at a prime-number interval. This provides O(1) performance while maintaining a high statistical probability of catching homogeneous errors.

```typescript
import { validate } from 'tosijs-schema'

const data = await fetchUsers()

// Pass the Schema Object (.schema)
if (!validate(data, UserSchema.schema)) {
  console.error('Invalid data received')
}
```

## Schema Diffing

Check the difference between two schemas to spot API changes or version drifts.

```typescript
import { diff } from 'tosijs-schema'

const V1 = s.object({ id: s.number })
const V2 = s.object({ id: s.string })

console.log(diff(V1.schema, V2.schema))
// Output: { id: { error: "Type mismatch: number vs string" } }
```

## API Reference

### Primitives & Properties (No Arguments)

Use these as static properties.

- **Base:** `s.string`, `s.number`, `s.boolean`, `.optional`
- **String Formats:** `.email`, `.uuid`, `.ipv4`, `.url`, `.datetime`, `.emoji`
- **Number Formats:** `.int`

### Constraints (Arguments Required)

Use these as chainable methods.

- **String:** `.pattern(/regex/)`, `.min(length)`, `.max(length)`
- **Number:** `.min(value)`, `.max(value)`, `.step(value)`
- **Array:** `.min(count)`, `.max(count)`

### Complex Types

- **Arrays:** `s.array(s.string)`
- **Objects:** `s.object({ key: s.string })`
- **Enums:** `s.enum(['a', 'b'])`
- **Unions:** `s.union([s.string, s.number])` — Maps to TypeScript unions (`|`) and JSON Schema `anyOf`.

## Limitations

To keep the library _tiny_ and _fast_, specific JSON Schema features are **not** implemented:

- **Tuples:** Arrays must be homogeneous (e.g., `string[]`). Mixed tuples (e.g., `[string, number]`) are not supported.
- **Complex Constraints:** `uniqueItems`, `minProperties`, and `dependencies` are omitted for performance.
- **Error Reporting:** `validate` returns a boolean. For detailed error trails, use `diff` or a generic JSON Schema validator.

## Why not Zod?

[Zod](https://zod.dev/) is an excellent library, but it is **TypeScript-first** and relies on a heavy Object-Oriented class hierarchy. While Zod claims a "2kB core", real-world bundles often exceed **12kB** because it does not tree-shake well (importing one feature often pulls in the whole library).

`tosijs-schema` is **Schema-first** and **Functional**.

- **Portable:** The output is standard JSON Schema, usable by other tools/languages.
- **Tiny:** Truly \< 2kB. You only pay for the builders you use.
- **Performance:** Uses "prime-jump" sampling for **O(1)** validation of massive arrays (vs Zod's O(N)).

Both have zero dependencies. Choose the one that meets your needs.

## License

MIT
