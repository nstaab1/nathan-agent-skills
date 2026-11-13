// Days are ISO calendar dates, 'YYYY-MM-DD', read as UTC midnight.

const toDate = (day) => new Date(`${day}T00:00:00Z`);

export function addDays(day, count) {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / DAY_MS);
}
