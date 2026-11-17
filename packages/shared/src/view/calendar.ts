import type { CalendarDate } from '../dates.ts';

/** Reads a date typed as day/month/year (31/12/2026, 31-12-26, 31.12.2026). Null when it isn't one. */
export function parseTypedDate(text: string): CalendarDate | null {
  const m = text.trim().match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10 Mar 2027", or "No date". */
export function formatDate(date: CalendarDate | null): string {
  if (!date) return 'No date';
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

/** Quick picks on the expiry screen. */
export function expiryChoices(today: CalendarDate): { label: string; date: CalendarDate }[] {
  return [
    { label: '+1 week', date: addDays(today, 7) },
    { label: '+1 month', date: addMonths(today, 1) },
    { label: '+3 months', date: addMonths(today, 3) },
    { label: '+6 months', date: addMonths(today, 6) },
    { label: '+1 year', date: addMonths(today, 12) },
  ];
}
