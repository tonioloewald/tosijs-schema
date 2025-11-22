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
      "format": "email"
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
    "email",
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

