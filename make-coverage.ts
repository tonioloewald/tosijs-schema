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
readme = replaceLine(
  readme,
  /(\| everything \| the whole library \| ~)[\d.]+( kB \|)/,
  `$1${gzKb}$2`,
  'README.md',
  'tree-shaking "everything" size row',
)
await Bun.write('README.md', readme)

console.log(`make-coverage: ${pass} tests, ${expects} assertions, ${overall}% lines, index.js ${gzKb} kB gzipped (v${version})`)
