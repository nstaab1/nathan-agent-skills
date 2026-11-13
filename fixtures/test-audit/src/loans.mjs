import { addDays } from './dates.mjs';
import { lateFeeCents } from './fees.mjs';

const STANDARD_LOAN_DAYS = 21;
const NEW_RELEASE_LOAN_DAYS = 7;

export function dueDate(book, from) {
  return addDays(from, book.newRelease ? NEW_RELEASE_LOAN_DAYS : STANDARD_LOAN_DAYS);
}

export class LoanDesk {
  constructor(catalog) {
    this.catalog = catalog;
    this._loans = new Map();
  }

  isAvailable(bookId) {
    return !this._loans.has(bookId);
  }

  checkout(memberId, bookId, today) {
    const book = this.catalog.find(bookId);
    if (!book) {
      throw new Error(`unknown book ${bookId}`);
    }
    if (!this.isAvailable(bookId)) {
      throw new Error(`${bookId} is already on loan`);
    }
    const loan = { memberId, bookId, due: dueDate(book, today) };
    this._loans.set(bookId, loan);
    return loan;
  }

  returnBook(bookId, today) {
    const loan = this._loans.get(bookId);
    if (!loan) {
      throw new Error(`${bookId} is not on loan`);
    }
    this._loans.delete(bookId);
    return { ...loan, returned: today, feeCents: lateFeeCents(loan.due, today) };
  }
}
