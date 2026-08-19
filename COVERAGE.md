# Test Coverage Report

> **Generated:** 2026-08-19
> **Test Framework:** Bun Test
> **Total Tests:** 266
> **Total Assertions:** 770
> **Pass Rate:** 100%

---

## Measured Coverage (`bun test --coverage`)

```
File             | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|---------|-------------------
All files        |   98.88 |   98.47 |
 src/contract.ts |   97.67 |   97.28 | 85,436,438,441,450-452,483-484
 src/formats.ts  |  100.00 |  100.00 |
 src/infer.ts    |  100.00 |  100.00 |
 src/monad.ts    |  100.00 |  100.00 |
 src/schema.ts   |   96.72 |   95.07 | 119-123,329-335,470,933-934,948,968-969,992-1001,1004-1005
```

## Summary

| Module | Lines | Tests | Line Coverage |
|--------|-------|-------|---------------|
| `schema.ts` | 1030 | 163 | 95.07% |
| `infer.ts` | 243 | 40 | 100% |
| `formats.ts` | 53 | (shared) | 100% |
| `monad.ts` | 179 | 10 | 100% |
| `contract.ts` | 532 | 42 | 97.27% |
| Type Inference | 251 | 17 | (compile-time) |
| **Total** | **2,288** | **266** | **98.47%** |

### contract.ts Coverage

| Feature | Status | Notes |
|---------|--------|-------|
| `agentContract().check()` | ✅ Covered | proposal judgment, refusal reasons, strict default, uncontracted passthrough |
| Fail-closed invariants | ✅ Covered | describe()/caller-mutation immunity, unenforced-keyword rejection, missing-proposal breach, `proposed: undefined` |
| `describe()` | ✅ Covered | plain-JSON round-trip, `$predicate`/examples ride-along |
| `checkExamples()` | ✅ Covered | rejected examples, accepted/unverifiable counterexamples, nested traversal, strict lint |
| `$`-key passthrough | ✅ Covered | verdict-neutrality + no mutation |

---

## schema.ts Coverage

### Builder API (`s.*`)

| Feature | Status | Tests | Notes |
|---------|--------|-------|-------|
| `s.string` | ✅ Covered | 8+ | Basic, min, max, pattern |
| `s.number` | ✅ Covered | 12+ | min, max, step, NaN, Infinity |
| `s.integer` | ✅ Covered | 6+ | Constraints, float rejection |
| `s.boolean` | ✅ Covered | 3+ | |
| `s.null` | ✅ Covered | 4 | Rejects undefined |
| `s.undefined` | ✅ Covered | 4 | Rejects null |
| `s.any` | ✅ Covered | 5 | Accepts all types |
| `s.object()` | ✅ Covered | 10+ | Required, optional, nested |
| `s.array()` | ✅ Covered | 8+ | min, max, items |
| `s.tuple()` | ✅ Covered | 5+ | Fixed length, mixed types |
| `s.record()` | ✅ Covered | 6+ | minProperties, maxProperties, stride |
| `s.enum()` | ✅ Covered | 4+ | String and number enums |
| `s.union()` | ✅ Covered | 12+ | Complex nested unions |
| `s.const()` | ✅ Covered | 5+ | All primitive types |
| `s.infer()` | ✅ Covered | 10 | All value types |
| `.optional` | ✅ Covered | 4+ | null/undefined acceptance |

### String Formats

| Format | Status | Tests | Validator |
|--------|--------|-------|-----------|
| `s.email` | ✅ Covered | 4 | `/^\S+@\S+\.\S+$/` |
| `s.uuid` | ✅ Covered | 3 | RFC 4122 pattern |
| `s.ipv4` | ✅ Covered | 5 | Octet range validation |
| `s.url` | ✅ Covered | 5 | `new URL()` parsing |
| `s.datetime` | ✅ Covered | 4 | `Date.parse()` |
| `s.emoji` | ✅ Covered | 4 | Unicode property escape |
| `s.pattern()` | ✅ Covered | 4 | Custom regex |

### Metadata

| Feature | Status | Tests |
|---------|--------|-------|
| `.title()` | ✅ Covered | 2+ |
| `.describe()` | ✅ Covered | 2+ |
| `.default()` | ✅ Covered | 2+ |
| `.meta()` | ✅ Covered | 2+ |

### Validator (`validate()`)

| Feature | Status | Tests | Notes |
|---------|--------|-------|-------|
| Type checking | ✅ Covered | 20+ | All primitive types |
| Numeric constraints | ✅ Covered | 10+ | min, max, multipleOf |
| String constraints | ✅ Covered | 8+ | minLength, maxLength, pattern |
| Array constraints | ✅ Covered | 6+ | minItems, maxItems |
| Object constraints | ✅ Covered | 8+ | required, minProperties, maxProperties |
| Union validation | ✅ Covered | 12+ | anyOf traversal |
| Const validation | ✅ Covered | 5+ | Exact match |
| Enum validation | ✅ Covered | 4+ | Inclusion check |
| NaN/Infinity rejection | ✅ Covered | 4 | `Number.isFinite()` |
| Floating-point step | ✅ Covered | 3 | Tolerance-based (`1e-10`) |
| Error callbacks | ✅ Covered | 6+ | Path reporting |
| Stride optimization | ✅ Covered | 8 | Arrays and objects |
| `strict` mode | ✅ Covered | 5 | Disables sampling, enforces maxProperties |
| `fullScan` option | ✅ Covered | 4 | Deprecated alias for `strict` |

### Filter (`filter()`)

| Feature | Status | Tests |
|---------|--------|-------|
| Strip extra properties | ✅ Covered | 3 |
| Nested objects | ✅ Covered | 2 |
| Arrays | ✅ Covered | 2 |
| Tuples | ✅ Covered | 2 |
| Validation errors | ✅ Covered | 3 |
| `skipValidation` | ✅ Covered | 2 |
| `strict` mode | ✅ Covered | 1 |
| Records | ✅ Covered | 1 |
| Primitives | ✅ Covered | 1 |

### Diff (`diff()`)

| Feature | Status | Tests |
|---------|--------|-------|
| Identical schemas | ✅ Covered | 1 |
| Type mismatch | ✅ Covered | 2 |
| Property changes | ✅ Covered | 3 |
| Numeric constraints | ✅ Covered | 2 |
| Const changes | ✅ Covered | 1 |
| Union mismatch | ✅ Covered | 1 |
| Tuple length mismatch | ✅ Covered | 1 |
| Tuple vs Array | ✅ Covered | 1 |
| Nested changes | ✅ Covered | 1 |

---

## monad.ts Coverage

| Feature | Status | Tests |
|---------|--------|-------|
| `M.func()` basic | ✅ Covered | 2 |
| Input validation | ✅ Covered | 2 |
| Output validation | ✅ Covered | 2 |
| Chain execution | ✅ Covered | 2 |
| Chain type safety | ✅ Covered | 1 |
| Error propagation | ✅ Covered | 1 |
| Async support | ✅ Covered | 1 |
| Timeout support | ✅ Covered | 2 |
| `SchemaError` | ✅ Covered | 3 |
| `TimeoutError` | ✅ Covered | 2 |

---

## Type Inference Coverage

Compile-time type checking via `@ts-expect-error` in `inference.types.ts`:

| Feature | Tests |
|---------|-------|
| Primitive inference | 2 |
| Object inference | 2 |
| Array inference | 2 |
| Optional inference | 2 |
| Nested inference | 1 |
| Format inference | 2 |
| Enum inference | 1 |
| Union inference | 2 |
| Tuple inference | 2 |
| Monadic inference | 5 |
| `s.any` inference | 1 |

---

## Edge Cases Covered

### Numeric
- [x] NaN rejection
- [x] Infinity / -Infinity rejection
- [x] -0 handling
- [x] Very large numbers (`Number.MAX_SAFE_INTEGER`)
- [x] Floating-point precision in `step()` (tolerance-based)
- [x] `step(0)` behavior (accepts all numbers)
- [x] Negative number constraints

### String
- [x] Empty string
- [x] Pattern with regex special chars
- [x] Newlines in strings

### Array
- [x] Empty arrays
- [x] Sparse arrays (undefined slots)
- [x] Array-like objects rejected
- [x] Stride optimization for large arrays (>97 items)
- [x] First/last element always checked

### Object
- [x] Empty object schema
- [x] `Object.create(null)` objects
- [x] Inherited properties ignored
- [x] Combined `properties` + `additionalProperties`
- [x] Stride optimization for large records (>97 keys)
- [x] `maxProperties` in strict mode

### Complex Unions
- [x] Union with null
- [x] Union with undefined
- [x] Nested unions (union of unions)
- [x] Union of arrays
- [x] Union of objects (discriminated)
- [x] Union with enum
- [x] Deeply nested structures
- [x] Union in record values

---

## Validation Modes

| Mode | Stride Sampling | `maxProperties` | Use Case |
|------|-----------------|-----------------|----------|
| **Default** | ✅ Enabled (O(1)) | ❌ Skipped | High-throughput APIs, trusted data |
| **`strict: true`** | ❌ Disabled (O(n)) | ✅ Enforced | Critical validation, untrusted input |

```typescript
// Default: fast, statistical sampling
validate(data, schema)

// Strict: full validation, all constraints
validate(data, schema, { strict: true })
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`maxProperties` skipped by default** | Counting properties is O(n), negating stride optimization benefits. Enforced in `strict` mode. Schema still contains the constraint for OpenAPI/documentation consumers. |
| **`additionalProperties: false` enforced (since v1.5.0)** | Unknown keys (including prototype-named ones) are refused. Previously skipped by a falsy-check bug; use `filter()` for lenient intake that strips extras. |
| **Stride sampling (97)** | Prime number avoids patterns. Checks ~1% of large arrays/objects while always verifying first and last items. |
| **`fullScan` deprecated** | Renamed to `strict` for clarity. `fullScan` still works as alias. |

---

## Known Limitations

| Item | Details |
|------|---------|
| Unicode string length | Uses JS `.length` (UTF-16 code units, not graphemes). `"👨‍👩‍👧".length === 8` |
| IPv4 leading zeros | Accepted by regex (e.g., `192.168.001.001`) |
| Email validation | Basic regex (`^\S+@\S+\.\S+$`), not RFC 5322 compliant |
| `maxLength` in diff | Not included in diff comparison |
| Diff on `additionalProperties` | Schema changes to record value types not fully diffed |

---

## Dependencies

### Runtime Dependencies

```
None
```

**This library has zero runtime dependencies.** The published package contains only the compiled code.

### Development Dependencies

| Dependency | Version | Purpose | Risk |
|------------|---------|---------|------|
| `typescript` | ^5 | Type checking & declarations | Low |
| `@types/bun` | latest | Bun runtime types | Low |
| `zod` | ^4.1.12 | Benchmark comparisons | None |
| `@sinclair/typebox` | ^0.34.47 | Benchmark comparisons | None |

---

## Risk Assessment

### Supply Chain Security

| Aspect | Status | Notes |
|--------|--------|-------|
| Runtime dependencies | ✅ **None** | Excellent - zero supply chain risk |
| Dev dependencies | ✅ Trusted | Microsoft (TS), Bun team, Zod |
| Post-install scripts | ✅ None | No arbitrary code execution |
| Published files | ✅ Limited | `dist/`, `CHANGELOG.md`, `llms.txt` via `files` field |
| Reproducible builds | ⚠️ Caution | `@types/bun: latest` may vary |

### Dependency Analysis

#### TypeScript (^5)
| Aspect | Value |
|--------|-------|
| Vendor | Microsoft |
| License | Apache-2.0 |
| Weekly Downloads | ~50M |
| Risk Level | **Low** |
| Concerns | None - industry standard |

#### @types/bun (latest)
| Aspect | Value |
|--------|-------|
| Vendor | Bun team / DefinitelyTyped |
| License | MIT |
| Risk Level | **Low** |
| Concerns | `latest` tag could vary between installs |
| Mitigation | Pin version for reproducible CI |
| Note | Dev-only, not in published package |

#### Zod (^4.1.12)
| Aspect | Value |
|--------|-------|
| Purpose | Benchmarks only (`bench.ts`) |
| Risk Level | **None** |
| Note | Not included in published package |

#### @sinclair/typebox (^0.34.47)
| Aspect | Value |
|--------|-------|
| Vendor | Haydn Paterson (sinclair) |
| License | MIT |
| Weekly Downloads | ~3M |
| Purpose | Benchmarks only (`bench.ts`) |
| Risk Level | **None** |
| Note | Not included in published package |

### Recommendations

1. **Pin @types/bun** for reproducible builds:
   ```json
   "@types/bun": "1.1.14"
   ```

2. **Commit lockfile** (`bun.lockb`) and use in CI

3. **Quarterly review** of dev dependencies

---

## Test Files

| File | Purpose | Assertions |
|------|---------|------------|
| `src/schema.test.ts` | Core validation, builder, diff | ~185 |
| `src/coverage.test.ts` | Edge cases, unions, formats | ~155 |
| `src/monad.test.ts` | Pipeline, timeout, errors | ~25 |
| `src/any.test.ts` | `s.any` type | ~10 |
| `src/inference.types.ts` | Compile-time type checks | 17 |

## Running Tests

```bash
# Run all tests
bun test

# Run specific file
bun test src/schema.test.ts

# Run with pattern
bun test --test-name-pattern "union"
```
