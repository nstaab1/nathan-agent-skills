import { expect, test } from 'vitest'
import { firstAttempt } from './first-attempt.js'

test('passes', () => {
  expect(1 + 1).toBe(2)
})

test('fails once', () => {
  expect(firstAttempt('fails once'), 'fails on its first attempt only').toBe(false)
})
