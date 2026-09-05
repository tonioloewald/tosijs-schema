// smoke.ts — the "does what you PUBLISH work, from outside?" lane.
//
// Everything else in `pack` looks at the source tree from inside, where the
// bundler and Bun paper over whole categories of defect. This packs the real
// tarball, installs it into a scratch consumer, imports BY PACKAGE NAME (never
// a relative path), typechecks the emitted declarations with skipLibCheck OFF,
// and executes. Four things are visible only here:
//
//   1. the `exports` map (subpaths that resolve, or don't)
//   2. the emitted .d.ts (a bundler never reads them; `tsc --noEmit` on the
//      source doesn't either — see tosijs-ui#61, tosijs#38)
//   3. the tarball's actual contents (the `files` allowlist)
//   4. that the published artifact RUNS, not just builds
//
// Adapted from tosijs-3d-ensemble's proposal in tosijs-ui#61. Deliberately
// dependency-free and ~1 minute; if it grows teeth it should still stay cheap
// enough that nobody is tempted to skip it.
import { mkdtempSync, rmSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (cmd: string[], cwd: string) => {
  const p = Bun.spawnSync(cmd, { cwd, stderr: 'pipe', stdout: 'pipe' })
  return {
    ok: p.exitCode === 0,
    out: p.stdout.toString() + p.stderr.toString(),
  }
}

const repo = import.meta.dir
const dir = mkdtempSync(join(tmpdir(), 'tosijs-schema-smoke-'))
let failed = false
const fail = (what: string, detail: string) => {
  failed = true
  console.error(`  ✗ ${what}\n${detail.split('\n').map((l) => '      ' + l).join('\n')}`)
}

try {
  // 1. pack the real tarball
  const packed = run(['npm', 'pack', '--silent'], repo)
  if (!packed.ok) throw new Error(`npm pack failed:\n${packed.out}`)
  const tarball = packed.out.trim().split('\n').pop()!.trim()
  renameSync(join(repo, tarball), join(dir, tarball))

  // 2. install it as a consumer would
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'smoke-consumer', type: 'module', dependencies: { 'tosijs-schema': `file:./${tarball}` } })
  )
  const install = run(['bun', 'install'], dir)
  if (!install.ok) throw new Error(`bun install failed:\n${install.out}`)

  // 3. exercise the public surface BY PACKAGE NAME — main entry + the /infer
  //    subpath (its own `exports` target, its own size budget) + a type import,
  //    so a broken exports map or a bad .d.ts is a hard failure here.
  writeFileSync(
    join(dir, 'use.ts'),
    `import { s, validate, filter, agentContract, unenforcedKeywords, ENFORCED_KEYWORDS, type Infer } from 'tosijs-schema'
import { inferSchema } from 'tosijs-schema/infer'

const S = s.object({ a: s.string, n: s.number.min(0) })
type T = Infer<typeof S>
const good: T = { a: 'hi', n: 1 }

const checks: Array<[string, boolean]> = [
  ['validate accepts valid', validate(good, S.schema) === true],
  ['validate rejects invalid', validate({ a: 'hi', n: -1 }, S.schema) === false],
  ['maxProperties enforced in default mode (v1.9.0)', validate({ a: 1, b: 2 }, { maxProperties: 1 }) === false],
  ['filter strips extras', JSON.stringify(filter({ a: 'hi', n: 1, junk: 9 }, S.schema)) === JSON.stringify(good)],
  ['unenforcedKeywords reports a gap', unenforcedKeywords({ allOf: [{ type: 'object' }] }).length === 1],
  ['ENFORCED_KEYWORDS is exported data', ENFORCED_KEYWORDS.has('maxProperties')],
  ['agentContract constructs and gates', agentContract({ 'x': S.schema }).check('x', good, { root: 'x', proposed: { a: 'hi', n: -1 } }) instanceof Error],
  ['infer subpath works', inferSchema({ q: 1 }).type === 'object'],
]
const bad = checks.filter(([, ok]) => !ok).map(([name]) => name)
// throw rather than process.exit: the consumer fixture is typechecked WITHOUT
// @types/node (a real consumer's tsconfig may lack it), so it must not name
// any node global. A throw still exits non-zero.
if (bad.length) throw new Error('FAILED: ' + bad.join('; '))
console.log('all ' + checks.length + ' runtime assertions passed')
`
  )

  // 4. typecheck the PUBLISHED declarations — skipLibCheck OFF is the point.
  //    Use the REPO'S OWN tsc, by absolute path, never `bunx tsc`: bunx resolves
  //    against the cwd, and the cwd here is a scratch dir, so it silently
  //    downloads whatever TypeScript is newest (measured: 7.0.2 in the scratch
  //    dir vs the repo's pinned 5.9.2). A release gate whose compiler version
  //    drifts underneath it reports failures the repo can't reproduce — the
  //    check's own scope becoming a silent parameter, which is the class this
  //    lane exists to catch. Forward-compat against newer tsc is a separate,
  //    NON-blocking question (see TODO.md).
  const tsc = run(
    //    `--target es2020` is our declared consumer baseline, and it must be
    //    explicit: tsc's DEFAULT target is ES5, whose lib has no `ReadonlySet`,
    //    so an unspecified target fails on our own `ENFORCED_KEYWORDS` type for
    //    a consumer nobody actually is. Asserting a baseline we publish is
    //    honest; asserting ES5 would block releases over a hypothetical.
    [join(repo, 'node_modules/.bin/tsc'), '--noEmit', '--strict', '--target', 'es2020', '--module', 'preserve', '--moduleResolution', 'bundler', 'use.ts'],
    dir
  )
  if (!tsc.ok) fail('published .d.ts does not typecheck from outside', tsc.out)
  else console.log('  ✓ published .d.ts typechecks from outside (skipLibCheck off)')

  // 5. and it must actually RUN
  const exec = run(['bun', 'use.ts'], dir)
  if (!exec.ok) fail('published package does not run', exec.out)
  else console.log(`  ✓ ${exec.out.trim()}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failed) {
  console.error('\nsmoke: FAILED — do not publish this tarball')
  process.exit(1)
}
console.log('smoke: OK — the published artifact imports, typechecks and runs')
