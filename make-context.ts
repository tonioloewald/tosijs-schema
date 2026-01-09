import { join } from 'path'
import { mkdir } from 'fs/promises'

const DIST_DIR = join(import.meta.dir, 'dist')
const CONTEXT_PATH = join(import.meta.dir, 'CONTEXT.md')
const EXAMPLES_PATH = join(import.meta.dir, 'examples.md')
const OUT_PATH = join(DIST_DIR, 'context.md')

console.log('📦 Bundling context.md...')

try {
  // Ensure dist exists (idempotent)
  await mkdir(DIST_DIR, { recursive: true })

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