/**
 * Dates typed into the app's date boxes. A browser's date input lets the year run to six digits, so one
 * extra keystroke ("20226" for "2026") is a perfectly valid date as far as the box is concerned - and the
 * database happily stores year 20226. The server then cannot turn that row back into a date, and every page
 * that lists it fails to load. So a date is only taken when it is a real calendar day in a sane range.
 */

export const MIN_DATE_YEAR = 2000;
export const MAX_DATE_YEAR = 2100;

const DATE_PREFIX = /^(\d{4,6})-(\d{2})-(\d{2})(?:$|[T\s])/;

/** "2026-10-12" (or an ISO timestamp starting with it): a real day, with a year between 2000 and 2100. */
export function isSaneDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const m = DATE_PREFIX.exec(value.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_DATE_YEAR || year > MAX_DATE_YEAR) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** What to tell the person who typed it. */
export function badDateMessage(value: unknown, label = "date"): string {
  const shown = typeof value === "string" && value.trim() ? value.trim().slice(0, 12) : "empty";
  return `The ${label} (${shown}) isn't a valid date - check the day, month and year (the year should be between ${MIN_DATE_YEAR} and ${MAX_DATE_YEAR}).`;
}
