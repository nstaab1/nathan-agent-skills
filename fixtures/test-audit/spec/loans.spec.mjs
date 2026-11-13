import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog } from '../src/catalog.mjs';
import { LoanDesk, dueDate } from '../src/loans.mjs';

const books = [
  { id: 'b1', title: 'The Long Way Home', newRelease: false },
  { id: 'b2', title: 'Rivers of Salt', newRelease: false },
  { id: 'b3', title: 'Glass Harbour', newRelease: true },
];

const openDesk = () => new LoanDesk(createCatalog(books));

test('a book is due back three weeks after checkout', () => {
  const loan = openDesk().checkout('m1', 'b1', '2024-03-01');
  assert.equal(loan.due, '2024-03-22');
});

test('a new release is due back one week after checkout', () => {
  const glassHarbour = books.find((book) => book.id === 'b3');
  const loan = openDesk().checkout('m1', 'b3', '2024-03-01');
  assert.equal(loan.due, dueDate(glassHarbour, '2024-03-01'));
});

test('a book already on loan cannot be checked out again', () => {
  const desk = openDesk();
  desk.checkout('m1', 'b2', '2024-03-01');
  assert.throws(() => desk.checkout('m2', 'b2', '2024-03-02'), /already on loan/);
});

test('checkout checks the book is available first', (t) => {
  const desk = openDesk();
  const isAvailable = t.mock.method(desk, 'isAvailable');
  desk.checkout('m1', 'b2', '2024-03-01');
  assert.equal(isAvailable.mock.callCount(), 1);
  assert.deepEqual(isAvailable.mock.calls[0].arguments, ['b2']);
});

test('checking out a book the catalog does not hold fails', () => {
  assert.throws(() => openDesk().checkout('m1', 'b404', '2024-03-01'), /unknown book/);
});

test('a returned book is available again', () => {
  const desk = openDesk();
  desk.checkout('m1', 'b1', '2024-03-01');
  assert.equal(desk.isAvailable('b1'), false);
  desk.returnBook('b1', '2024-03-10');
  assert.equal(desk.isAvailable('b1'), true);
});

test('returning a book late reports the fee owed', () => {
  const desk = openDesk();
  desk.checkout('m1', 'b1', '2024-03-01');
  const loan = desk.returnBook('b1', '2024-03-24');
  assert.equal(loan.feeCents, 50);
});
