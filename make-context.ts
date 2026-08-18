import { join } from 'path'
import { mkdir } from 'fs/promises'

const DIST_DIR = join(import.meta.dir, 'dist')
const CONTEXT_PATH = join(import.meta.dir, 'CONTEXT.md')
const EXAMPLES_PATH = join(import.meta.dir, 'examples.md')
const LLMS_PATH = join(import.meta.dir, 'llms.txt')
const PKG_PATH = join(import.meta.dir, 'package.json')
const OUT_PATH = join(DIST_DIR, 'context.md')

console.log('📦 Bundling context.md...')

try {
  // Ensure dist exists (idempotent)
  await mkdir(DIST_DIR, { recursive: true })

  // Stamp llms.txt's version header from package.json (single source of
  // truth). A hand-edit that forgets this now produces a diff, so the
  // pack drift gate catches a stale version instead of silently passing it.
  const version = JSON.parse(await Bun.file(PKG_PATH).text()).version
  const llms = await Bun.file(LLMS_PATH).text()
  const stamped = llms.replace(
    /^# tosijs-schema v[\d.]+/m,
    `# tosijs-schema v${version}`
  )
  if (stamped !== llms) {
    await Bun.write(LLMS_PATH, stamped)
    console.log(`✅ Stamped llms.txt → v${version}`)
  }

  const context = await Bun.file(CONTEXT_PATH).text()
  const examples = await Bun.file(EXAMPLES_PATH).text()

  const combined = [
    context.trim(),
    '\n\n---\n\n', // Clear separation
    examples.trim()
  ].join('')

  await Bun.write(OUT_PATH, combined)
  console.log(`✅ Wrote context to ${OUT_PATH}`)
} catch (error) {
  console.error('❌ Failed to bundle context:', error)
  process.exit(1)
}