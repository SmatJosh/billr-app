// Dates are stored as local calendar days, "YYYY-MM-DD", so time zones never shift a due date.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PAYMENT_TERMS = [
  { days: 0, label: 'On receipt' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
] as const;

// How long a quote's price holds.
export const QUOTE_VALIDITY = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
] as const;

export function toDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function today(): string {
  return toDay(new Date());
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, days: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + days);
  return toDay(d);
}

export function formatDay(day: string): string {
  const d = parseDay(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// "31 Oct" this year, "31 Oct 2027" otherwise, for tight list rows.
export function formatDayShort(day: string, now: string = today()): string {
  return day.slice(0, 4) === now.slice(0, 4) ? formatDay(day).slice(0, -5) : formatDay(day);
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return toDay(parseDay(day)) === day;
}

export function isOverdue(dueDay: string, now: string = today()): boolean {
  return dueDay < now;
}
