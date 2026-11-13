import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lateFeeCents } from '../src/fees.mjs';

test('no fee when the book comes back before it is due', () => {
  assert.equal(lateFeeCents('2024-03-10', '2024-03-08'), 0);
});

test('charges 25 cents for each day late', () => {
  assert.equal(lateFeeCents('2024-03-01', '2024-03-04'), 75);
});

test('the fee stops growing at five dollars', () => {
  assert.equal(lateFeeCents('2024-01-01', '2024-03-01'), 500);
});

test('a book returned three days late owes 75 cents', () => {
  assert.equal(lateFeeCents('2024-05-10', '2024-05-13'), 75);
});
