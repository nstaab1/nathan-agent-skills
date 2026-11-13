import { daysBetween } from './dates.mjs';

const DAILY_FINE_CENTS = 25;
const FEE_CAP_CENTS = 500;

export function lateFeeCents(due, returned) {
  const daysLate = Math.max(0, daysBetween(due, returned));
  return Math.min(daysLate * DAILY_FINE_CENTS, FEE_CAP_CENTS);
}
