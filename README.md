# tosijs-schema

A schema-first Typescript / Javascript library for generating a single source of truth for types.

1. Define your data types once, using [json-schema](https://json-schema.org/)
2. Infer Typescript types from these schema
3. Efficiently check types, including large arrays (using "prime-jump" sampling for very large arrays)
4. Compare schemas to see when things change (or document changes)

## Defining a schema

```
import { s, Infer } from 'tosjis-schema'

// define your schema
export const UserSchema = s.object({
  id: s.number(),
  email: s.string(),
})

export const UserArraySchema = s.array(UserSchema)

// infer Typescript type definition
export UserType = Infer<typeof UserSchema>
export UserArrayType = Infer<typeof UserArraySchema>
```

## Runtime validation

```
if (!validate(users, UserArrayType.schema)) {
  // throw an error
}
```
