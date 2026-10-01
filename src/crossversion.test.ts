// Builders crossing between installed copies of tosijs-schema (board: cross-version
// builder test). Two copies meet when a consumer's dependency tree doesn't dedupe —
// tosijs-ui nests an older copy via tjs-lang, for one. Three real copies here:
//   src/      — this tree (1.12+, branded)
//   second    — this tree BUNDLED into a temp dir and imported: a separate module
//               instance of the same version (what two deduped-apart copies are),
//               so the brand must work through Symbol.for, not module identity.
//               (Not dist/: `pack` deletes dist/ before it runs the tests. Not a
//               query-string re-import of src/: coverage would report that second
//               instance under the same path and clobber the real numbers.)
//   1.11.0    — the last pre-brand release, from npm (devDependency alias)
import { describe, test, expect, afterAll } from 'bun:test'
import { s, validate, filter, isBuilder, BUILDER } from './schema'
import { M } from './monad'
import * as old from 'tosijs-schema-1-11'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const outdir = mkdtempSync(join(tmpdir(), 'tosijs-schema-second-copy-'))
// registered BEFORE the build/import, so a failure there can't leak the dir
afterAll(() => rmSync(outdir, { recursive: true, force: true }))
const built = await Bun.build({ entrypoints: [join(import.meta.dir, '..', 'index.ts')], outdir })
if (!built.success) throw new Error('could not bundle the second copy')
const second: typeof import('../index') = await import(built.outputs[0]!.path)

const good = { a: 'ok' }
const bad = { a: 42 }

describe('cross-copy builders', () => {
  test('the copies really are distinct module instances', () => {
    expect(second.validate).not.toBe(validate)
    expect(second.BUILDER).toBe(BUILDER) // same registry symbol across instances
    expect(old.validate).not.toBe(validate)
    expect((old.s.string as any)[BUILDER]).toBeUndefined() // pre-brand
  })

  test('a separate 1.12 copy\'s builder is recognised by the BRAND alone', () => {
    const b = second.s.object({ a: second.s.string })
    // strip the method so only the registry-symbol brand can identify it
    const { validate: _v, ...brandOnly } = b as any
    expect(isBuilder(brandOnly)).toBeTrue()
    expect(validate(good, brandOnly)).toBeTrue()
    expect(validate(bad, brandOnly)).toBeFalse()
    expect(s.array(brandOnly as any).validate([good])).toBeTrue()
  })

  for (const [name, b] of [
    ['1.11.0 (pre-brand) builder', old.s.object({ a: old.s.string })],
    ["second 1.12 copy's builder", second.s.object({ a: second.s.string })],
  ] as const) {
    test(`${name} → this copy's validate / filter / M.func / combinators`, async () => {
      expect(validate(good, b as any)).toBeTrue()
      expect(validate(bad, b as any)).toBeFalse()
      expect(filter({ ...good, junk: 1 }, b as any)).toEqual(good)
      expect(await M.func(b as any, b as any, (d: any) => d)(good)).toEqual(good)
      const composed = s.object({ inner: b as any, list: s.array(b as any) })
      expect(composed.validate({ inner: good, list: [good] })).toBeTrue()
      expect(composed.validate({ inner: bad, list: [good] })).toBeFalse()
    })
  }

  test("this copy's branded builder → 1.11.0's validate / filter / combinators", () => {
    const b = s.object({ a: s.string })
    expect(old.validate(good, b as any)).toBeTrue()
    expect(old.validate(bad, b as any)).toBeFalse()
    expect(old.filter({ ...good, junk: 1 }, b as any)).toEqual(good)
    expect(old.s.array(b as any).validate([good])).toBeTrue()
    expect(old.s.array(b as any).validate([bad])).toBeFalse()
  })

  test("this copy's builder → a second copy's combinators (brand across instances)", () => {
    const composed = second.s.object({ inner: s.object({ a: s.string }) as any })
    expect(composed.validate({ inner: good })).toBeTrue()
    expect(composed.validate({ inner: bad })).toBeFalse()
  })
})
