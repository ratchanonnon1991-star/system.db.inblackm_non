// Reading a database value as a number or a date. Both the layout helpers and
// the formula engine need these, and the formula engine is imported by the
// layout helpers, so they live apart from either to keep the imports acyclic.

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// dd/mm/yyyy is what the sheets this replaces are full of, and `new Date` reads
// it as month/day. Anything else is left to the platform parser.
const SLASHED_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

export function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return null;
  const text = String(value).trim();
  if (!text) return null;
  const slashed = SLASHED_DATE.exec(text);
  if (slashed) {
    const [, day, month, year] = slashed;
    // A "year" past 2400 is the Buddhist era, which is how Thai spreadsheets
    // and a few of the older tables write it.
    const ce = Number(year) > 2400 ? Number(year) - 543 : Number(year);
    const date = new Date(ce, Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_MS = 86400000;

/** Midnight-to-midnight, so a time of day never shifts the answer by a day. */
export function dayDiff(later, earlier) {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
      Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) /
      DAY_MS
  );
}

/** Whole days from today to `value`; negative once the date has passed. */
export function daysUntil(value) {
  return dayDiff(value, new Date());
}

export function addDays(value, days) {
  const date = toDate(value);
  const count = toNumber(days);
  if (!date || count === null) return null;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + Math.trunc(count));
  return next;
}
