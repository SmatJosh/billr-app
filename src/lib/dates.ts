// Dates are stored as local calendar days, "YYYY-MM-DD", so time zones never shift a due date.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PAYMENT_TERMS = [
  { days: 0, label: 'On receipt' },
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

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return toDay(parseDay(day)) === day;
}

export function isOverdue(dueDay: string, now: string = today()): boolean {
  return dueDay < now;
}
