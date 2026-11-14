import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Marker files carry state from one attempt to the next, whether the attempt
// is a retry inside the same Vitest process or a new Vitest process.
const state = process.env.FLAKE_STATE ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.flake-state')

// True the first time `key` is seen since the state folder was cleared.
export function firstAttempt(key) {
  const marker = join(state, key.replace(/[^\w.-]/g, '_'))
  if (existsSync(marker)) return false
  mkdirSync(state, { recursive: true })
  writeFileSync(marker, '')
  return true
}
