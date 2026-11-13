import { afterEach, beforeAll, describe, expect, test } from 'vitest'

describe('outer', () => {
  describe('inner', () => {
    test('nested test', () => {
      expect(true).toBe(true)
    })
  })
})

test.each([1, 2])('each %i', (n) => {
  expect(n).toBeGreaterThan(0)
})

test.each(['a b', 'x > y'])('each odd %s', (text) => {
  expect(text).toBeTruthy()
})

test.each([1, 2])('each without placeholder', (n) => {
  expect(n).toBe(2)
})

test('fails', () => {
  expect(1).toBe(2)
})

test('throws', () => {
  throw new TypeError('not an assertion')
})

test.skip('skipped', () => {})

test.todo('todo')

test.fails('expected to fail', () => {
  expect(1).toBe(2)
})

describe('setup hook fails', () => {
  beforeAll(() => {
    throw new Error('setup blew up')
  })

  test('under failing beforeAll', () => {})
})

describe('teardown hook fails', () => {
  afterEach(() => {
    throw new Error('teardown blew up')
  })

  test('passes then afterEach error', () => {})
})
