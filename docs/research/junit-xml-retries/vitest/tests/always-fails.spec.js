import { expect, test } from 'vitest'

test('always fails', () => {
  expect(1 + 1, 'fails on every attempt').toBe(3)
})
