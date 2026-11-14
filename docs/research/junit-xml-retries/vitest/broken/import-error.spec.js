import { test } from 'vitest'
import './module-that-does-not-exist.js'

test('never collected', () => {})
