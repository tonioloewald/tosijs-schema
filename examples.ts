import { s } from './src/schema'

// --- Helper to generate Markdown sections ---
const print = (
  name: string,
  description: string,
  code: string,
  schema: any
) => {
  console.log(`## ${name}\n`)
  console.log(`${description}\n`)
  console.log('### Definition')
  console.log('```typescript')
  console.log(code.trim())
  console.log('```\n')
  console.log('### JSON Schema Output')
  console.log('```json')
  console.log(JSON.stringify(schema, null, 2))
  console.log('```\n')
}

// --- Header ---
console.log('# tosijs-schema Examples\n')
console.log(
  '> This document is generated automatically by running `bun examples.ts`.\n'
)

// ------------------------------------------------------------------
// EXAMPLE 1: The "Person"
// ------------------------------------------------------------------
const Person = s
  .object({
    id: s.string.uuid,
    name: s.string.min(2).title('Full Name'),
    age: s.integer.min(0).max(120),
    email: s.string.email.optional,
    tags: s.array(s.string).min(1),
  })
  .meta({
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://example.com/schemas/person',
    title: 'Person',
    description: 'A human being record',
  })

print(
  '1. Basic Object & Metadata',
  'Demonstrates basic primitives, first-class integers, UUID formats, and top-level metadata ($id, $schema).',
  `const Person = s.object({
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
})`,
  Person.schema
)

// ------------------------------------------------------------------
// EXAMPLE 2: The "App Config"
// ------------------------------------------------------------------
const AppConfig = s
  .record(s.union([s.string, s.number, s.boolean]))
  .min(1)
  .max(10)
  .describe('Application Feature Flags')

print(
  '2. Dictionaries & Ghost Constraints',
  'Demonstrates `s.record` (additionalProperties) and the "Ghost" constraint behavior. `minProperties` (1) is validated strictly, while `maxProperties` (10) is included in the schema for documentation but ignored by the runtime validator for performance.',
  `const AppConfig = s.record(s.union([s.string, s.number, s.boolean]))
  .min(1)   // Validated: Must have at least 1 key
  .max(10)  // Ghost: Documented max 10, but not validated
  .describe("Application Feature Flags")`,
  AppConfig.schema
)

// ------------------------------------------------------------------
// EXAMPLE 3: The "API Response"
// ------------------------------------------------------------------
const Success = s.object({
  status: s.enum(['success']),
  data: s.object({ id: s.integer }),
  timestamp: s.string.datetime,
})

const Error = s.object({
  status: s.enum(['error']),
  code: s.integer,
  message: s.string,
})

const ApiResponse = s.union([Success, Error])

print(
  '3. Unions & Enums',
  'Demonstrates discriminating unions (like `oneOf` / `anyOf`) using Enums to differentiate between Success and Error states.',
  `const Success = s.object({
  status: s.enum(['success']),
  data: s.object({ id: s.integer }),
  timestamp: s.string.datetime
})

const Error = s.object({
  status: s.enum(['error']),
  code: s.integer,
  message: s.string
})

const ApiResponse = s.union([Success, Error])`,
  ApiResponse.schema
)

// ------------------------------------------------------------------
// EXAMPLE 4: The "GeoLocation"
// ------------------------------------------------------------------
const Coordinate = s.tuple([s.number, s.number]).describe('Lat/Long Pair')

print(
  '4. Tuples',
  'Demonstrates fixed-length arrays where position matters (e.g., [Latitude, Longitude]).',
  `const Coordinate = s.tuple([s.number, s.number])
  .describe("Lat/Long Pair")`,
  Coordinate.schema
)

// ------------------------------------------------------------------
// EXAMPLE 5: Validation Usage
// ------------------------------------------------------------------

console.log('## 5. Validation Usage\n')
console.log(
  'Demonstrates the flexible `validate` signature. You can pass the builder object directly or the raw JSON schema.\n'
)

console.log('### Code')
console.log('```typescript')
console.log(
  `
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
`.trim()
)
console.log('```\n')

// ------------------------------------------------------------------
// EXAMPLE 6: Agent Contracts
// ------------------------------------------------------------------
import { agentContract, checkExamples } from './src/contract'

const Order = s
  .object({
    item: s.string,
    qty: s.number.min(1),
  })
  .meta({
    examples: [{ item: 'kumquat', qty: 3 }],
    $counterexamples: [{ item: 'kumquat' }, { item: 42, qty: 1 }],
  })

print(
  '6. Agent Contracts & Examples-as-Tests',
  'Demonstrates `agentContract` — the adapter for capability-gated write paths ' +
    '(e.g. the tosijs agent surface). `check()` judges a proposed whole-root value ' +
    'and returns `true` or an `Error` carrying the refusal reason; `describe()` ' +
    'returns the serializable per-root contract. The `examples` / `$counterexamples` ' +
    'conventions make the contract self-proving: `checkExamples()` lints that every ' +
    'example passes and every counterexample fails, at definition time.',
  `const Order = s.object({
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

checkExamples(Order) // [] — the spec doesn't lie`,
  Order.schema
)

console.log('### Refusal Output')
console.log('```')
console.log(
  String(
    agentContract({ 'app.order': Order }).check('app.order.qty', 'x', {
      root: 'app.order',
      proposed: { item: 'yuzu', qty: 'x' },
    })
  )
)
console.log(`checkExamples findings: ${JSON.stringify(checkExamples(Order))}`)
console.log('```\n')

// ------------------------------------------------------------------
// EXAMPLE 7: Inferring a schema from data
// ------------------------------------------------------------------
import { inferSchema } from './src/infer'

const rows = [
  { id: 1, tag: 'a', at: '2020-01-01T00:00:00Z' },
  { id: 2, at: '2020-02-01T00:00:00Z' }, // no `tag`
]

print(
  '7. Inferring a Schema from Data',
  '`inferSchema(sample, opts?)` derives a schema from example data — the ' +
    'runtime inverse of `Infer<S>`. It unifies across EVERY element (a key ' +
    "missing from the first row keeps its column), presence decides `required`, " +
    'and objects stay OPEN (`additionalProperties: true`) because an inferred ' +
    'schema describes a sample, not a contract. Structure only — it never ' +
    'invents `minimum`/`maxLength` constraints from a sample. Guarantee: ' +
    '`validate(sample, inferSchema(sample))` is always true.',
  `const rows = [
  { id: 1, tag: 'a', at: '2020-01-01T00:00:00Z' },
  { id: 2, at: '2020-02-01T00:00:00Z' },   // no 'tag'
]

inferSchema(rows)                          // tag → optional
inferSchema(rows, { formats: true })       // sniff 'at' as date-time`,
  inferSchema(rows, { formats: true })
)

// ------------------------------------------------------------------
// EXAMPLE 8: Open objects — protocols you don't control
// ------------------------------------------------------------------
const ChatMessage = s
  .object({
    role: s.enum(['system', 'user', 'assistant']),
    content: s.string.optional,
  })
  .open

print(
  '8. Open Objects',
  'Objects are strict by default (`additionalProperties: false`). `.open` ' +
    'keeps the declared fields and admits unknown ones — for a shape that ' +
    "belongs to a protocol you don't control, like an LLM chat message whose " +
    'provider adds `reasoning_content`/`refusal`/`audio` over time. It rejects ' +
    'what is WRONG (a bad `role`) without rejecting what is merely NEWER.',
  `const ChatMessage = s.object({
  role: s.enum(['system', 'user', 'assistant']),
  content: s.string.optional,
}).open   // or s.object({...}, { additionalProperties: true })`,
  ChatMessage.schema
)
