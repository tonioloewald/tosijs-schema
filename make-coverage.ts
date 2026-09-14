// make-coverage.ts — regenerate the machine-measured figures in COVERAGE.md and
// README.md (test/assertion counts, the `bun test --coverage` table, the
// gzipped bundle size) so the drift gate (regenerate + `git diff` must be clean)
// covers them, the way make-context.ts covers llms.txt. Run inside `bun run pack`.
//
// Hand-editing the marker-delimited regions or the targeted lines below is
// pointless: the next `pack` overwrites them from measured output. Fails loud
// (non-zero exit) if a test fails or a target region can't be found, so a
// silent no-op can't let the docs drift again.
import { gzipSync } from 'bun'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoDir = import.meta.dir

const run = (cmd: string[]): string => {
  const p = Bun.spawnSync(cmd, { stderr: 'pipe', stdout: 'pipe' })
  // bun test writes its summary + coverage table to stderr
  return p.stderr.toString() + p.stdout.toString()
}

const out = run(['bun', 'test', '--coverage'])

const pass = /(\d+)\s+pass/.exec(out)?.[1]
const fail = /(\d+)\s+fail/.exec(out)?.[1]
const expects = /(\d+)\s+expect\(\) calls/.exec(out)?.[1]
if (!pass || !expects || fail !== '0') {
  console.error(out)
  throw new Error(`make-coverage: tests failed or output unparseable (pass=${pass} fail=${fail} expect=${expects})`)
}

// --- extract the coverage table (header + one separator + data rows), matching
// the committed style: drop bun's top and bottom separator rules. ---
const lines = out.split('\n')
const hi = lines.findIndex((l) => /^File\s+\|\s+% Funcs/.test(l))
if (hi < 0) {
  console.error(out)
  throw new Error('make-coverage: coverage table header not found')
}
const rstrip = (s: string) => s.replace(/\s+$/, '')
const headerLine = lines[hi]
const sepLine = lines[hi + 1]
if (headerLine === undefined || sepLine === undefined) {
  throw new Error('make-coverage: coverage table truncated after header')
}
const tableRows = [rstrip(headerLine), rstrip(sepLine)]
for (let i = hi + 2; i < lines.length; i++) {
  const l = lines[i]
  if (l === undefined || !l.includes('|')) break // end of table
  if (/^\s*-+\|/.test(l)) break // bun's closing separator rule
  tableRows.push(rstrip(l))
}
const table = tableRows.join('\n')

// overall % Lines from the All files row, for the Summary total
const overall = /All files\s+\|\s+[\d.]+\s+\|\s+([\d.]+)/.exec(out)?.[1]
if (!overall) throw new Error('make-coverage: could not read All-files line coverage')

// --- gzipped bundle size (matches `gzip -9`) ---
const idxBytes = await Bun.file('dist/index.js').bytes()
const gzKb = (gzipSync(idxBytes, { level: 9 }).length / 1024).toFixed(1)

// --- PER-IMPORT sizes, measured the way a consumer's bundler would see them.
// Tree-shakeability is a marketed feature, and these four rows were
// hand-maintained: every one drifted 15-20% low and shipped wrong through five
// releases, while the ONE generated row ("everything") stayed correct — which
// made the stale rows look freshly verified. Reviews flagged it twice. Measuring
// them here puts them under the existing drift gate (regenerate, then
// `git status --porcelain` must be empty), so they cannot silently rot again.
const ENTRY_POINTS = ['validate', 's', 'filter', 'diff', 'agentContract'] as const
const perImport: Record<string, string> = {}
{
  const shimDir = mkdtempSync(join(tmpdir(), 'tosijs-schema-size-'))
  try {
    for (const name of ENTRY_POINTS) {
      const shim = join(shimDir, `${name}.ts`)
      // re-export exactly one name from the BUILT bundle: what a bundler shakes
      writeFileSync(shim, `export { ${name} } from ${JSON.stringify(join(repoDir, 'dist/index.js'))}\n`)
      const outFile = join(shimDir, `${name}.js`)
      const built = Bun.spawnSync(
        ['bun', 'build', shim, '--minify', '--target=node', '--outfile', outFile],
        { stdout: 'pipe', stderr: 'pipe' }
      )
      if (built.exitCode !== 0) {
        throw new Error(
          `make-coverage: could not bundle the '${name}' entry point for sizing:\n` +
            built.stderr.toString()
        )
      }
      const bytes = gzipSync(await Bun.file(outFile).bytes(), { level: 9 }).length
      perImport[name] = (bytes / 1024).toFixed(1)
    }
  } finally {
    rmSync(shimDir, { recursive: true, force: true })
  }
}

// the /infer subpath is its own bundle with its own budget — measure the
// artifact we actually publish, not a shim through the main entry
const inferKb = (
  gzipSync(await Bun.file('dist/infer.js').bytes(), { level: 9 }).length / 1024
).toFixed(1)

// Stamp the package VERSION, not a wall-clock date — a date would make the
// drift gate (regenerate + `git diff` clean) go dirty the day after release
// with no code change. Version only moves on a bump, exactly like llms.txt.
const version = (await Bun.file('package.json').json()).version

// --- edits ---
const replaceBlock = (text: string, name: string, body: string, file: string): string => {
  const re = new RegExp(`(<!-- ${name}[^>]*-->\\n)[\\s\\S]*?(\\n<!-- /${name} -->)`)
  if (!re.test(text)) throw new Error(`make-coverage: marker <!-- ${name} --> not found in ${file}`)
  return text.replace(re, `$1${body}$2`)
}
const replaceLine = (text: string, re: RegExp, repl: string, file: string, what: string): string => {
  if (!re.test(text)) throw new Error(`make-coverage: could not find ${what} in ${file}`)
  return text.replace(re, repl)
}

const stats = [
  `> **Measured at:** v${version}`,
  '> **Test Framework:** Bun Test',
  `> **Total Tests:** ${pass}`,
  `> **Total Assertions:** ${expects}`,
  '> **Pass Rate:** 100%',
].join('\n')
const fenced = '```\n' + table + '\n```'

let cov = await Bun.file('COVERAGE.md').text()
cov = replaceBlock(cov, 'coverage:stats', stats, 'COVERAGE.md')
cov = replaceBlock(cov, 'coverage:table', fenced, 'COVERAGE.md')
cov = replaceLine(
  cov,
  /(\| \*\*Total\*\* \| \*\*[\d,]+\*\* \| \*\*)\d+(\*\* \| \*\*)[\d.]+(%\*\* \|)/,
  `$1${pass}$2${overall}$3`,
  'COVERAGE.md',
  'Summary Total row',
)
await Bun.write('COVERAGE.md', cov)

let readme = await Bun.file('README.md').text()
readme = replaceBlock(readme, 'coverage:readme', `${fenced}\n\n${pass} tests, ${expects} assertions.`, 'README.md')
for (const name of ENTRY_POINTS) {
  const label = name === 's' ? '`s` \\(builder\\)' : `\`${name}\``
  readme = replaceLine(
    readme,
    new RegExp(`(\\| ${label} \\| [^|]+\\| ~)[\\d.]+( kB \\|)`),
    `$1${perImport[name]}$2`,
    'README.md',
    `per-import size row for ${name}`,
  )
}
readme = replaceLine(
  readme,
  /(\| `inferSchema` \(from `tosijs-schema\/infer`\) \| just inference \| \*\*~)[\d.]+( kB\*\* \|)/,
  `$1${inferKb}$2`,
  'README.md',
  'inferSchema subpath size row',
)
// the prose range + the llms.txt ceiling are derived from the SAME measurements,
// so a doc cannot claim a budget the build does not produce. llms.txt ships in
// the tarball and is NOT otherwise under the drift gate, which is exactly how a
// stale `~1-4.6kB` survived eight releases and two reviews that named the file.
const namedImportKbs = ENTRY_POINTS.map((n) => Number(perImport[n]))
const loKb = Math.min(...namedImportKbs).toFixed(1)
const hiKb = Math.max(...namedImportKbs).toFixed(1)
readme = replaceLine(
  readme,
  /(so it stays ~)[\d.]+( kB even where a bundler)/,
  `$1${inferKb}$2`,
  'README.md',
  'inferSchema subpath size in prose',
)
readme = replaceLine(
  readme,
  /(importing `validate`, `s`, `filter`, or `diff` all land in the same )[\d.]+–[\d.]+( kB range)/,
  `$1${loKb}–${hiKb}$2`,
  'README.md',
  'per-import prose range',
)
readme = replaceLine(
  readme,
  /(\| everything \| the whole library \| ~)[\d.]+( kB \|)/,
  `$1${gzKb}$2`,
  'README.md',
  'tree-shaking "everything" size row',
)
await Bun.write('README.md', readme)

let llms = await Bun.file('llms.txt').text()
llms = replaceLine(
  llms,
  /(shake to ~)[\d.]+–[\d.]+(kB; `tosijs-schema\/infer` is a self-contained ~)[\d.]+(kB subpath)/,
  `$1${loKb}–${hiKb}$2${inferKb}$3`,
  'llms.txt',
  'tree-shaking size sentence',
)
await Bun.write('llms.txt', llms)

console.log(`make-coverage: ${pass} tests, ${expects} assertions, ${overall}% lines, index.js ${gzKb} kB gzipped (v${version})`)
