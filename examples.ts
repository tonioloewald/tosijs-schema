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
