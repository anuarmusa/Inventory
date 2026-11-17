/** A calendar date as `YYYY-MM-DD`. Expiry dates and "today" are compared as calendar days, never as instants. */
export type CalendarDate = string;

const DAY_MS = 86_400_000;

function toUtcMs(date: CalendarDate): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Not a calendar date: ${date}`);
  return ms;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}
